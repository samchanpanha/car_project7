// Payment slip OCR engine and anti-fraud verification for Cambodian banking apps
// (ABA Mobile, Bakong KHQR, ACLEDA, Wing, Canadia, Sathapana, etc.).
// Extracts Trx ID, APV, amount, currency, timestamp, and payee; validates against
// required plan amounts and prevents duplicate/old transaction reuse.

import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { db } from "@/lib/db";
import { normalizePaymentRef, phnomPenhDateKey, isCurrentDateInCambodia, formatPhnomPenhDate, arePaymentRefsMatching } from "./reference";
import { DEFAULT_KHR_PER_USD, toleranceFor, usdToKhr } from "./currency";
import { matchInterbankTransaction, detectBankFromContext, KNOWN_BANKS } from "./interbank-matcher";
import crypto from "crypto";

export {
  type ParsedReceiptData,
  type VerificationResult,
  parseReceiptText,
  detectBankFromReceipt,
  arePaymentRefsMatching,
} from "./ocr-parser";
import type { ParsedReceiptData, VerificationResult } from "./ocr-parser";

/** Compute SHA-256 hash of image data to prevent re-uploading identical screenshots. */
export function computeImageHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Preprocess receipt image buffer for optimal OCR recognition (grayscale, normalized contrast). */
export async function preprocessReceiptImage(inputBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(inputBuffer)
      .resize(1600, 2400, { fit: "inside", withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return inputBuffer;
  }
}

import path from "path";
import fs from "fs";

/** Resolve tesseract worker path so it works reliably in bundled Node environments */
function resolveWorkerPath(): string | undefined {
  const candidates = [
    path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    path.join(process.cwd(), "node_modules/.pnpm/tesseract.js@7.0.0/node_modules/tesseract.js/src/worker-script/node/index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ c)) return c;
  }
  return undefined;
}

/** Run Tesseract OCR on receipt image buffer. */
export async function runOcrOnBuffer(buffer: Buffer): Promise<string> {
  try {
    const processed = await preprocessReceiptImage(buffer);
    const workerPath = resolveWorkerPath();
    const worker = await createWorker("eng", 1, workerPath ? { workerPath } : undefined);
    try {
      const res = await worker.recognize(processed);
      let text = res.data.text || "";

      // Multi-bank footer enhancement: check footer banner for bank name / logo text (e.g. UCB, ACLEDA, Sathapana)
      try {
        const meta = await sharp(buffer).metadata();
        if (meta.width && meta.height && meta.height > 300) {
          const bottomBuffer = await sharp(buffer)
            .extract({
              left: 0,
              top: Math.floor(meta.height * 0.78),
              width: meta.width,
              height: Math.floor(meta.height * 0.22),
            })
            .resize(meta.width * 2)
            .grayscale()
            .threshold(135)
            .png()
            .toBuffer();
          const footerRes = await worker.recognize(bottomBuffer);
          if (footerRes.data.text?.trim()) {
            text += "\n" + footerRes.data.text.trim();
          }
        }
      } catch {
        // non-fatal
      }

      return text;
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch (err) {
    console.error("[OCR Node Engine] Tesseract error, fallback empty:", err);
    return "";
  }
}

/**
 * Verify extracted receipt data against expected plan pricing,
 * checking for duplicates, stale timestamps, and payment collisions.
 */
export async function verifyReceiptAgainstPlan({
  parsed,
  expectedUsd,
  expectedKhr: expectedKhrOverride,
  expectedCurrency,
  khrRate = DEFAULT_KHR_PER_USD,
  maxTrxAgeHours = 72,
  imageHash,
  enteredRef,
  expectedMerchantName,
  skipMerchantCheck = true,
}: {
  parsed: ParsedReceiptData;
  expectedUsd: number;
  expectedKhr?: number;
  expectedCurrency: "USD" | "KHR";
  khrRate?: number;
  maxTrxAgeHours?: number;
  imageHash?: string;
  enteredRef?: string | null;
  expectedMerchantName?: string | null;
  skipMerchantCheck?: boolean;
}): Promise<VerificationResult> {
  const riskFlags: string[] = [];
  let isDuplicate = false;
  let duplicateDetails: string | null = null;
  let isOld = false;
  let ageHours: number | null = null;

  // 1. Reference / Trx ID Mismatch Check (User entered ref vs Receipt image)
  let isRefMismatch = false;
  let refMismatchDetails: string | null = null;
  let detectedRefOnSlip: string | null = null;

  if (enteredRef && enteredRef.trim()) {
    const refMatchOutcome = arePaymentRefsMatching(enteredRef, {
      trxId: parsed.trxId,
      externalRef: parsed.externalRef,
      apv: parsed.apv,
      rawText: parsed.rawText,
    });

    detectedRefOnSlip = refMatchOutcome.detectedReference || parsed.trxId || parsed.externalRef || parsed.apv || null;

    if (!refMatchOutcome.match) {
      isRefMismatch = true;
      refMismatchDetails = `Transaction ID mismatch: The entered Trx ID "${enteredRef.trim()}" does not match the reference detected on the uploaded receipt slip ("${detectedRefOnSlip || "Unknown"}"). Real money verification requires exact matching transaction reference.`;
      riskFlags.push("TRX_ID_MISMATCH");
    }
  }

  // 2. Exact Image Duplicate Check (SHA-256)
  if (imageHash) {
    const duplicateImage = await (db.subscriptionPayment as any).findFirst({
      where: {
        evidenceHash: imageHash,
        status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
      },
      select: { reference: true, status: true, createdAt: true },
    });
    if (duplicateImage) {
      isDuplicate = true;
      duplicateDetails = `Exact receipt image previously submitted on payment ${duplicateImage.reference} (${duplicateImage.status})`;
      riskFlags.push("DUPLICATE_RECEIPT_IMAGE");
    }
  }

  // 3. Reference Duplicate Check (Trx ID / APV)
  const targetRef = parsed.trxId || parsed.apv || enteredRef?.trim();
  if (targetRef) {
    const normalized = normalizePaymentRef(targetRef, { paidAt: parsed.paidAt });
    if (normalized) {
      const cleanVal = normalized.value;
      const trxKey = `TRX:${cleanVal}`;
      const rawTarget = targetRef.trim();

      try {
        // Check SubscriptionPayment table across manualRef, manualRefKey, ocrRef, and reference
        const duplicatePayment = await (db.subscriptionPayment as any).findFirst({
          where: {
            OR: [
              { manualRef: cleanVal },
              { manualRef: rawTarget },
              { manualRef: trxKey },
              { manualRefKey: trxKey },
              { manualRefKey: cleanVal },
              { manualRefKey: normalized.key },
              { manualRefKey: normalized.value },
              { ocrRef: cleanVal },
              { ocrRef: rawTarget },
              { ocrRef: trxKey },
              { reference: cleanVal },
              { reference: rawTarget },
            ],
            status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
          },
          select: { reference: true, status: true, manualRef: true, createdAt: true },
        });
        if (duplicatePayment) {
          isDuplicate = true;
          duplicateDetails = `Transaction reference "${cleanVal}" was already used on payment ${duplicatePayment.reference} (${duplicatePayment.status})`;
          riskFlags.push("DUPLICATE_TRANSACTION_ID");
        }

        // Check matched AbaTransaction table
        const duplicateAba = await db.abaTransaction.findFirst({
          where: {
            OR: [
              { trxId: cleanVal },
              { trxId: rawTarget },
              { apv: cleanVal },
              { apv: rawTarget },
            ],
            status: "MATCHED",
          },
          select: { trxId: true, matchedAt: true, status: true },
        });
        if (duplicateAba) {
          isDuplicate = true;
          duplicateDetails = `Bank transaction ID "${duplicateAba.trxId}" has already been verified and matched.`;
          riskFlags.push("ALREADY_MATCHED_ABA_TRX");
        }
      } catch (dbErr) {
        console.warn("[OCR verifyReceiptAgainstPlan] Local DB query failed, querying backend check-ref fallback:", dbErr);
        try {
          const backendBase = process.env.BACKEND_URL || "http://backend:8080";
          const res = await fetch(`${backendBase}/api/tenant/payments/check-ref?ref=${encodeURIComponent(cleanVal)}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const json = (await res.json()) as { duplicate?: boolean; message?: string };
            if (json.duplicate) {
              isDuplicate = true;
              duplicateDetails = json.message || `Transaction reference "${cleanVal}" was already used on another payment.`;
              riskFlags.push("DUPLICATE_TRANSACTION_ID");
            }
          }
        } catch (beErr) {
          console.warn("[OCR verifyReceiptAgainstPlan] Backend check-ref fallback failed:", beErr);
        }
      }
    }
  } else {
    riskFlags.push("MISSING_TRANSACTION_ID");
  }

  // 4. Payee / Merchant Validation (skip if skipMerchantCheck is true)
  let isWrongMerchant = false;
  let wrongMerchantDetails: string | null = null;
  const officialMerchant = (expectedMerchantName || "SAM CHAN PANHA").trim().toUpperCase();

  if (!skipMerchantCheck) {
    const rawUpper = parsed.rawText.toUpperCase();
    const merchantTokens = officialMerchant.split(/\s+/).filter((t) => t.length >= 3);
    const rawHasOfficial = merchantTokens.length > 0 && merchantTokens.every((tok) => rawUpper.includes(tok));

    if (!rawHasOfficial) {
      let detectedPayeeCandidate = parsed.payee;
      if (!detectedPayeeCandidate) {
        const rawPaidTo = parsed.rawText.match(/(?:Merchant\s*Name|Paid\s*to|Payee|KHQR\s*to|Merchant)[:\s]*([^\r\n]{3,50})/i);
        if (rawPaidTo) {
          detectedPayeeCandidate = rawPaidTo[1].trim().replace(/\s+/g, " ");
          parsed.payee = detectedPayeeCandidate;
        }
      }

      if (detectedPayeeCandidate && detectedPayeeCandidate.trim()) {
        const payeeClean = detectedPayeeCandidate.toUpperCase().replace(/[^A-Z]/g, "");
        const matchesAnyToken = merchantTokens.some((tok) => payeeClean.includes(tok));
        const isGenericWord = /^(NAME|BANK|MERCHANT|ID|ACCOUNT|ABABANK|WINGBANK)$/i.test(detectedPayeeCandidate.trim());

        if (!matchesAnyToken && payeeClean.length >= 4 && !isGenericWord) {
          isWrongMerchant = true;
          wrongMerchantDetails = `⛔ Security Block: This payment was sent to "${detectedPayeeCandidate}", NOT to our official KHQR merchant account ("${officialMerchant}"). Unrelated or foreign payment receipts cannot be submitted.`;
          riskFlags.push("WRONG_PAYEE_MERCHANT");
        }
      }
    }
  }

  // 5. Transaction Timestamp / Age Check (Preventing old Trx IDs)
  if (parsed.paidAt) {
    const now = Date.now();
    const diffMs = now - parsed.paidAt.getTime();
    ageHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;

    if (diffMs > maxTrxAgeHours * 60 * 60 * 1000) {
      isOld = true;
      riskFlags.push("OLD_TRANSACTION_DATE");
    } else if (diffMs < -60 * 60 * 1000) {
      riskFlags.push("FUTURE_TRANSACTION_DATE");
    }
  }

  let isNotCurrentDate = false;
  let notCurrentDateDetails: string | null = null;
  let transactionDateFormatted: string | undefined;
  let matchedAbaTrxId: string | undefined;
  let originatingBankName: string | undefined = parsed.bankName || undefined;

  // Check slip's extracted timestamp against current date in Cambodia
  if (parsed.paidAt && !isCurrentDateInCambodia(parsed.paidAt)) {
    isNotCurrentDate = true;
    transactionDateFormatted = parsed.paidAtRaw || formatPhnomPenhDate(parsed.paidAt);
    notCurrentDateDetails = `Payment receipt date (${transactionDateFormatted}) is not today's date. Past-date transactions cannot be accepted. Please contact Admin on Telegram (@samchanpanha).`;
    riskFlags.push("NOT_CURRENT_DATE");
  }

  // Cross-correlate interbank transaction (e.g. ACLEDA Ref -> ABA Trx ID)
  if (targetRef || parsed.payerName || parsed.payerAccount) {
    const interbank = await matchInterbankTransaction({
      rawRef: targetRef || "",
      amountExpected: parsed.amount ?? (expectedCurrency === "USD" ? expectedUsd : (expectedKhrOverride && expectedKhrOverride > 0 ? expectedKhrOverride : usdToKhr(expectedUsd, khrRate))),
      currencyExpected: parsed.currency || expectedCurrency,
      bankCodeHint: parsed.bankCode || parsed.bankName,
      payerNameHint: parsed.payerName,
      payerAccountHint: parsed.payerAccount,
      paidAtHint: parsed.paidAt,
    });

    if (interbank.originatingBank) {
      originatingBankName = interbank.originatingBank.name;
    }

    if (interbank.matched && interbank.transaction) {
      const abaTx = interbank.transaction;
      matchedAbaTrxId = abaTx.trxId;

      if (abaTx.status === "MATCHED") {
        isDuplicate = true;
        duplicateDetails = `Bank transaction (Trx ID ${abaTx.trxId}) has already been verified and matched.`;
        riskFlags.push("ALREADY_MATCHED_ABA_TRX");
      }

      const txTime = abaTx.transactionDate || abaTx.createdAt;
      if (txTime && !isCurrentDateInCambodia(txTime)) {
        isNotCurrentDate = true;
        transactionDateFormatted = abaTx.transactionDateRaw || formatPhnomPenhDate(txTime);
        notCurrentDateDetails = `Transaction was located in Telegram bank alerts (matched via ${originatingBankName || "Interbank"} to ABA Trx ${abaTx.trxId}), but its date (${transactionDateFormatted}) is not today's date. Past-date transactions cannot be submitted.`;
        riskFlags.push("NOT_CURRENT_DATE");
      } else if (txTime && !isOld) {
        const diffMs = Date.now() - txTime.getTime();
        const hrs = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        if (hrs > maxTrxAgeHours) {
          isOld = true;
          ageHours = hrs;
          riskFlags.push("OLD_TRANSACTION_DATE");
        }
      }
    }
  }

  // 6. Amount & Underpayment Matching
  let amountMatch = false;
  let currencyMatch = false;
  let isUnderpaid = false;
  let underpaidDetails: string | null = null;

  const expectedKhr = expectedKhrOverride && expectedKhrOverride > 0 ? expectedKhrOverride : usdToKhr(expectedUsd, khrRate);
  const usdTol = toleranceFor("USD");
  const khrTol = toleranceFor("KHR");

  if (expectedCurrency === "USD") {
    currencyMatch = parsed.currency === "USD" || parsed.amountUsd !== null;
    if (parsed.amountUsd !== null) {
      amountMatch = Math.abs(parsed.amountUsd - expectedUsd) <= usdTol;
      if (!amountMatch && parsed.amountUsd < (expectedUsd - usdTol)) {
        isUnderpaid = true;
        underpaidDetails = `Underpaid receipt: Receipt indicates $${parsed.amountUsd.toFixed(2)} USD, but selected plan requires $${expectedUsd.toFixed(2)} USD. Full payment is required.`;
        riskFlags.push("UNDERPAID");
      }
    } else if (parsed.amountKhr !== null) {
      amountMatch = Math.abs(parsed.amountKhr - expectedKhr) <= khrTol;
      currencyMatch = true;
      if (!amountMatch && parsed.amountKhr < (expectedKhr - khrTol)) {
        isUnderpaid = true;
        underpaidDetails = `Underpaid receipt: Receipt indicates ៛${parsed.amountKhr.toLocaleString()} KHR, but selected plan requires ៛${expectedKhr.toLocaleString()} KHR ($${expectedUsd.toFixed(2)} USD). Full payment is required.`;
        riskFlags.push("UNDERPAID");
      }
    }
  } else {
    // Expected Currency is KHR
    currencyMatch = parsed.currency === "KHR" || parsed.amountKhr !== null;
    if (parsed.amountKhr !== null) {
      amountMatch = Math.abs(parsed.amountKhr - expectedKhr) <= khrTol;
      if (!amountMatch && parsed.amountKhr < (expectedKhr - khrTol)) {
        isUnderpaid = true;
        underpaidDetails = `Underpaid receipt: Receipt indicates ៛${parsed.amountKhr.toLocaleString()} KHR, but selected plan requires ៛${expectedKhr.toLocaleString()} KHR. Full payment is required.`;
        riskFlags.push("UNDERPAID");
      }
    } else if (parsed.amountUsd !== null) {
      amountMatch = Math.abs(parsed.amountUsd - expectedUsd) <= usdTol;
      currencyMatch = true;
      if (!amountMatch && parsed.amountUsd < (expectedUsd - usdTol)) {
        isUnderpaid = true;
        underpaidDetails = `Underpaid receipt: Receipt indicates $${parsed.amountUsd.toFixed(2)} USD, but selected plan requires ៛${expectedKhr.toLocaleString()} KHR ($${expectedUsd.toFixed(2)} USD). Full payment is required.`;
        riskFlags.push("UNDERPAID");
      }
    }
  }

  if (!amountMatch && !isUnderpaid) {
    riskFlags.push("AMOUNT_MISMATCH");
  }

  // 7. Final Status & Message (Prioritizing Security & Fraud prevention)
  let status: "PASS" | "WARN" | "MISMATCH" = "PASS";
  let message = "Receipt verified successfully.";

  if (isWrongMerchant) {
    status = "MISMATCH";
    message = wrongMerchantDetails || "Security Block: Payment receipt was paid to the wrong merchant/payee. Submission blocked.";
  } else if (isRefMismatch) {
    status = "MISMATCH";
    message = refMismatchDetails || "Transaction ID mismatch: The entered Trx ID does not match the uploaded receipt slip.";
  } else if (isUnderpaid) {
    status = "MISMATCH";
    message = underpaidDetails || "Underpaid payment: Receipt amount is less than the required subscription plan price.";
  } else if (isDuplicate) {
    status = "MISMATCH";
    message = duplicateDetails || "Duplicate transaction detected: This transaction ID or receipt has already been used.";
  } else if (isNotCurrentDate) {
    status = "MISMATCH";
    message = notCurrentDateDetails || "Transaction date is not current date: This transaction was processed on a previous day. Past-date transactions cannot be submitted. Please contact Admin at @samchanpanha.";
  } else if (isOld) {
    status = "MISMATCH";
    message = `Old transaction detected: This payment receipt is dated ${ageHours ? `${ageHours}h ago` : "in the past"}, exceeding the ${maxTrxAgeHours}h validity limit. Please submit a recent payment.`;
  } else if (!amountMatch) {
    status = "WARN";
    const detectedStr = parsed.amountUsd ? `$${parsed.amountUsd}` : parsed.amountKhr ? `៛${parsed.amountKhr.toLocaleString()}` : "Unknown";
    const requiredStr = expectedCurrency === "USD" ? `$${expectedUsd.toFixed(2)} USD` : `៛${expectedKhr.toLocaleString()} KHR`;
    message = `Amount mismatch: Receipt indicates ${detectedStr}, but selected plan requires ${requiredStr}. Administrator review will be required.`;
  } else if (parsed.confidence < 70) {
    status = "WARN";
    message = "Receipt scanned with low confidence. Please verify the extracted Trx ID before submitting.";
  }

  return {
    status,
    confidence: parsed.confidence,
    amountMatch,
    currencyMatch,
    isDuplicate,
    duplicateDetails,
    isOld,
    ageHours,
    isNotCurrentDate,
    transactionDateFormatted,
    telegramAdmin: "@samchanpanha",
    telegramAdminLink: "https://t.me/samchanpanha",
    isInterbank: parsed.isInterbank || Boolean(originatingBankName && originatingBankName !== "ABA Bank"),
    originatingBank: originatingBankName,
    abaTrxId: matchedAbaTrxId,
    isRefMismatch,
    refMismatchDetails,
    detectedRefOnSlip,
    isWrongMerchant,
    detectedPayee: parsed.payee,
    expectedMerchant: officialMerchant,
    isUnderpaid,
    riskFlags,
    message,
  };
}
