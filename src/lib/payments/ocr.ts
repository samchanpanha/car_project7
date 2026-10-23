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

export interface ParsedReceiptData {
  trxId: string | null;
  externalRef: string | null;
  apv: string | null;
  amount: number | null;
  currency: "USD" | "KHR" | null;
  amountUsd: number | null;
  amountKhr: number | null;
  paidAt: Date | null;
  paidAtRaw: string | null;
  payerName: string | null;
  payerAccount: string | null;
  payee: string | null;
  beneficiaryBank: string | null;
  bankName: string | null;
  bankCode: string | null;
  isInterbank: boolean;
  rawText: string;
  confidence: number; // 0 - 100
}

export interface VerificationResult {
  status: "PASS" | "WARN" | "MISMATCH";
  confidence: number;
  amountMatch: boolean;
  currencyMatch: boolean;
  isDuplicate: boolean;
  duplicateDetails?: string | null;
  isOld: boolean;
  ageHours?: number | null;
  isNotCurrentDate?: boolean;
  transactionDateFormatted?: string;
  telegramAdmin?: string;
  telegramAdminLink?: string;
  isInterbank?: boolean;
  originatingBank?: string;
  abaTrxId?: string;
  isRefMismatch?: boolean;
  refMismatchDetails?: string | null;
  detectedRefOnSlip?: string | null;
  isWrongMerchant?: boolean;
  detectedPayee?: string | null;
  expectedMerchant?: string | null;
  isUnderpaid?: boolean;
  riskFlags: string[];
  message: string;
}

export { arePaymentRefsMatching };

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
    await worker.terminate();
  }
}

/** Extract receipt fields specifically tuned for Cambodian bank confirmation receipts (ABA Mobile, ACLEDA Bank, Wing, Canadia, UCB, etc.). */
export function parseReceiptText(rawText: string): ParsedReceiptData {
  const text = rawText.replace(/\r\n/g, "\n");

  // 1. Transaction Reference & External Ref
  let trxId: string | null = null;
  let externalRef: string | null = null;
  let apv: string | null = null;

  // External Txn Ref (e.g. "External Txn Ref : 6e0973e6" on ACLEDA, "External Txn Ref ffa673fe" on UCB)
  const extRefMatch = text.match(/(?:External\s*Txn\s*Ref|External\s*Ref|Ext\s*Ref)[:\s#]*([0-9a-zA-Z]{6,32})/i);
  if (extRefMatch) {
    externalRef = extRefMatch[1].trim();
  }

  // Reference No. / Transaction ID / Ref No. (e.g. "Reference No. FT262967KHCC", "Reference No. : 62956359142", "Ref No.: 9847192", "Trx. ID: 17926...")
  const refMatch = text.match(
    /(?:Reference(?:\s*(?:No\.?|ID|#|Number))?|\bRef(?:\s*(?:No\.?|ID|#|Number))?|Trx\.?\s*(?:ID|No\.?|#)?|Transaction\s*(?:ID|No\.?|Ref|Hash|Number)?|Txn\s*(?:ID|No\.?|#)?|Bank\s*Ref(?:\s*No\.?)?)[:\s#]+([0-9A-Za-z]{6,32})/i,
  );
  if (refMatch) {
    trxId = refMatch[1].trim();
  } else if (externalRef) {
    trxId = externalRef;
  } else {
    // Standalone 15-digit ABA transaction ID pattern
    const standalone15 = text.match(/\b(17\d{13}|\d{15})\b/);
    if (standalone15) {
      trxId = standalone15[1].trim();
    }
  }

  // 2. APV code (6 digits)
  const apvMatch = text.match(/\bAPV[:\s#]*([0-9]{6})\b/i);
  if (apvMatch) {
    apv = apvMatch[1].trim();
  }

  // 3. Bank Identification (supports all Cambodian commercial banks & Bakong)
  let bankName: string | null = null;
  let bankCode: string | null = null;
  let isInterbank = false;

  const detectedBank = detectBankFromContext({
    ref: trxId || externalRef || undefined,
    rawText: text,
  });

  if (detectedBank) {
    bankName = detectedBank.name;
    bankCode = detectedBank.code;
    isInterbank = detectedBank.code !== "ABA";
  } else if (!/(?:transfer\s*to|beneficiary.*bank)\s*aba/i.test(text) && /ABA\s*Mobile|PayWay\s*by\s*ABA|ABA\s*Bank/i.test(text)) {
    bankName = "ABA Bank";
    bankCode = "ABA";
    isInterbank = false;
  }

  // 4. Payer Details (From Account & Account No)
  let payerName: string | null = null;
  let payerAccount: string | null = null;

  const fromMatch = text.match(/(?:From\s*Account|From|Sender|Payer)[:\s]*([A-Za-z\s]{3,35})(?:\n|$)/i);
  if (fromMatch) {
    payerName = fromMatch[1].trim().replace(/\s+/g, " ");
  }

  const accMatch = text.match(/(?:Account\s*No\.?|From\s*Acc|Account)[:\s]*([0-9\s*]{4,25})/i);
  if (accMatch) {
    const rawAcc = accMatch[1].replace(/\s+/g, "");
    const lastDigits = rawAcc.match(/(\d{3,4})$/);
    if (lastDigits) {
      payerAccount = `*${lastDigits[1]}`;
    }
  } else if (fromMatch) {
    // Check if subsequent line contains account number digits
    const afterFrom = text.slice(text.indexOf(fromMatch[0]) + fromMatch[0].length);
    const nextDigits = afterFrom.match(/^\s*([0-9]{6,16})/);
    if (nextDigits) {
      const rawAcc = nextDigits[1].trim();
      const lastDigits = rawAcc.match(/(\d{3,4})$/);
      if (lastDigits) {
        payerAccount = `*${lastDigits[1]}`;
      }
    }
  }

  // 5. Payee & Beneficiary Bank
  let payee: string | null = null;
  let beneficiaryBank: string | null = null;

  // Extract explicit payee (e.g. "Merchant Name: SAM CHAN PANHA", "Paid to ...", "Payee: ...", "KHQR to: ...")
  const toMatch = text.match(/(?:Merchant\s*Name|Paid\s*to|Payee|KHQR\s*to|To\s*Account|To\s*Merchant)[:\s]*([^\r\n]{3,50})(?:\n|\r|$)/i);
  if (toMatch) {
    const rawVal = toMatch[1].trim().replace(/\s+/g, " ");
    if (!/^(ID|Bank|ABA Bank|Wing Bank|Canadia Bank|ACLEDA Bank|Account)/i.test(rawVal)) {
      payee = rawVal;
    }
  }

  const benBankMatch = text.match(/(?:Beneficiary\s*Bank|Transfer\s*to\s*Bank|Transfer\s*to)[:\s]*([A-Za-z\s]{3,25})(?:\n|$)/i);
  if (benBankMatch) {
    beneficiaryBank = benBankMatch[1].trim();
  }

  // 6. Amount & Currency
  let amountUsd: number | null = null;
  let amountKhr: number | null = null;

  // USD regexes: require explicit $ or USD symbol/word
  const usdRegexes = [
    /(?:Debit\s*Amount|Amount|Total)[:\s]*-?\s*\$\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /(?:Debit\s*Amount|Amount|Total)[:\s]*-?\s*([0-9]+(?:\.[0-9]{2})?)\s*USD\b/i,
    /\$\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /([0-9]+(?:\.[0-9]{2})?)\s*USD\b/i,
  ];
  for (const rx of usdRegexes) {
    const m = text.match(rx);
    if (m) {
      const val = parseFloat(m[1]);
      if (val > 0 && Number.isFinite(val)) {
        amountUsd = val;
        break;
      }
    }
  }

  // KHR regexes: e.g. "100.00 KHR" or "100 ៛" or "Debit Amount : -100 KHR" or "៛200,900" or "200,900 KHR"
  const khrRegexes = [
    /(?:Debit\s*Amount|Amount|Total)[:\s]*-?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:KHR|៛)/i,
    /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,9})(?:\.[0-9]{1,2})?\s*(?:៛|KHR)\b/i,
    /[៛]\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*៛/i,
    /\(([0-9,]+(?:\.[0-9]{1,2})?)\s*KHR\)/i,
  ];
  for (const rx of khrRegexes) {
    const m = text.match(rx);
    if (m) {
      const cleanNum = parseInt(m[1].replace(/,/g, "").split(".")[0], 10);
      if (cleanNum > 0 && Number.isFinite(cleanNum)) {
        amountKhr = cleanNum;
        break;
      }
    }
  }

  let currency: "USD" | "KHR" | null = null;
  let amount: number | null = null;
  if (amountUsd !== null && amountKhr === null) {
    currency = "USD";
    amount = amountUsd;
  } else if (amountKhr !== null && amountUsd === null) {
    currency = "KHR";
    amount = amountKhr;
  } else if (amountUsd !== null && amountKhr !== null) {
    if (/[៛]|KHR/i.test(text) && !/[$]|USD/i.test(text)) {
      currency = "KHR";
      amount = amountKhr;
    } else {
      currency = "USD";
      amount = amountUsd;
    }
  }

  // 7. Paid Date & Time
  let paidAt: Date | null = null;
  let paidAtRaw: string | null = null;

  const datePatterns = [
    // Oct 22, 2026 | 11:26 PM or Oct 22, 2026 11:26 PM
    /([A-Za-z]{3}\s+\d{1,2}(?:,\s+\d{4})?\s*[|,]?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i,
    // 22 Oct 2026, 01:05 PM
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?)/i,
    // 2026-10-22 13:05:00
    /(\d{4}[-/]\d{2}[-/]\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i,
    // 22/10/2026 13:05
    /(\d{1,2}[-/]\d{2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i,
  ];

  for (const rx of datePatterns) {
    const m = text.match(rx);
    if (m) {
      paidAtRaw = m[1].trim();
      const sanitized = paidAtRaw.replace("|", "").trim();
      const parsedTs = Date.parse(sanitized);
      if (!Number.isNaN(parsedTs)) {
        paidAt = new Date(parsedTs);
        break;
      }
    }
  }

  // Calculate extraction confidence score (0 to 100)
  let score = 0;
  if (trxId) score += 35;
  if (externalRef) score += 15;
  if (amount !== null) score += 25;
  if (currency !== null) score += 10;
  if (bankName !== null) score += 10;
  if (paidAt !== null) score += 5;

  return {
    trxId,
    externalRef,
    apv,
    amount,
    currency,
    amountUsd,
    amountKhr,
    paidAt,
    paidAtRaw,
    payerName,
    payerAccount,
    payee,
    beneficiaryBank,
    bankName,
    bankCode,
    isInterbank,
    rawText: text,
    confidence: Math.min(100, score),
  };
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
      // Check SubscriptionPayment table
      const duplicatePayment = await (db.subscriptionPayment as any).findFirst({
        where: {
          OR: [
            { manualRef: normalized.value },
            { manualRefKey: normalized.key },
          ],
          status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
        },
        select: { reference: true, status: true, manualRef: true, createdAt: true },
      });
      if (duplicatePayment) {
        isDuplicate = true;
        duplicateDetails = `Transaction reference "${normalized.value}" was already used on payment ${duplicatePayment.reference} (${duplicatePayment.status})`;
        riskFlags.push("DUPLICATE_TRANSACTION_ID");
      }

      // Check matched AbaTransaction table
      const duplicateAba = await db.abaTransaction.findFirst({
        where: {
          OR: [
            { trxId: normalized.value },
            { apv: normalized.value },
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
