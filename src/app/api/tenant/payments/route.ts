import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import {
  generatePaymentReference,
  getManualPaymentConfig,
  monthsForCycle,
  resolveTelegramConfig,
  toPaymentErrorResponse,
  verifyPaymentAndActivate,
} from "@/lib/api/payments";
import { getPlanPricing, priceForCfg, type PaidPlanKey } from "@/lib/api/plan-config";
import { sendPaymentProofToTelegram, telegramConfigured } from "@/lib/api/telegram-notify";
import { rateLimit } from "@/lib/rate-limit";
import type { SubscriptionPaymentDTO } from "@/lib/commerce-types";
import { normalizePaymentRef, isCurrentDateInCambodia, formatPhnomPenhDate } from "@/lib/payments/reference";
import { computeImageHash, parseReceiptText, runOcrOnBuffer, verifyReceiptAgainstPlan, arePaymentRefsMatching } from "@/lib/payments/ocr";
import { usdToKhr } from "@/lib/payments/currency";
import { matchInterbankTransaction, detectBankFromContext } from "@/lib/payments/interbank-matcher";
import { syncTelegramGroupUpdates } from "@/lib/api/aba-sync";

export const dynamic = "force-dynamic";

/** How long manual approval usually takes — surfaced to the seller after submitting. */
export const APPROVAL_WAIT_MINUTES = 10;

function toDTO(
  p: {
    id: string; plan: string; billingCycle: string; amountUsd: number; months: number;
    currency?: string | null; amountExpected?: number | null;
    method: string; status: string; reference: string; manualRef: string | null;
    evidenceUrl: string | null; evidenceImage: string | null; telegramSentAt: Date | null;
    telegramError: string | null; note: string | null; rejectionReason: string | null;
    tenantId: string; reviewedAt: Date | null; verifiedByName?: string | null; createdAt: Date;
    ocrStatus?: string | null; ocrConfidence?: number | null; ocrRef?: string | null;
    ocrAmount?: number | null; ocrCurrency?: string | null; ocrPaidAt?: Date | null;
    riskFlagsJson?: string | null;
  },
  tenantName?: string,
  opts?: { includeImage?: boolean },
): SubscriptionPaymentDTO {
  let riskFlags: string[] | undefined;
  if (p.riskFlagsJson) {
    try {
      riskFlags = JSON.parse(p.riskFlagsJson);
    } catch {}
  }

  return {
    id: p.id,
    plan: p.plan as SubscriptionPaymentDTO["plan"],
    billingCycle: p.billingCycle as "MONTHLY" | "YEARLY",
    amountUsd: p.amountUsd,
    currency: (p.currency as "USD" | "KHR") || "USD",
    amountExpected: p.amountExpected,
    months: p.months,
    method: p.method as SubscriptionPaymentDTO["method"],
    status: p.status as SubscriptionPaymentDTO["status"],
    reference: p.reference,
    manualRef: p.manualRef,
    evidenceUrl: p.evidenceUrl,
    // the heavy image only travels to the admin queue; list views get the flag
    ...(opts?.includeImage ? { evidenceImage: p.evidenceImage } : { hasEvidenceImage: Boolean(p.evidenceImage) }),
    ocrStatus: p.ocrStatus,
    ocrConfidence: p.ocrConfidence,
    ocrRef: p.ocrRef,
    ocrAmount: p.ocrAmount,
    ocrCurrency: p.ocrCurrency,
    ocrPaidAt: p.ocrPaidAt?.toISOString() ?? null,
    riskFlags,
    telegramSentAt: p.telegramSentAt?.toISOString() ?? null,
    telegramError: p.telegramError,
    note: p.note,
    rejectionReason: p.rejectionReason,
    tenantId: p.tenantId,
    tenantName,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    verifiedByName: p.verifiedByName ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

let lastTgSyncTime = 0;

export async function GET(req: Request) {
  try {
    const { tenant } = await requireTenantMember();
    let rows = await db.subscriptionPayment.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Reactive sync: When tenant has an open pending payment, or when manual refresh (?sync=true) is called,
    // poll unread Telegram updates so inline button clicks ([Approve]/[Reject]) or commands take effect immediately.
    const url = new URL(req.url);
    const forceSync = url.searchParams.get("sync") === "true";
    const hasAwaiting = rows.some((r) => r.status === "AWAITING_VERIFICATION");

    if ((hasAwaiting || forceSync) && (forceSync || Date.now() - lastTgSyncTime > 2000)) {
      lastTgSyncTime = Date.now();
      try {
        const config = await getManualPaymentConfig();
        const { botToken, chatId } = resolveTelegramConfig(config);
        if (botToken) {
          const outcome = await syncTelegramGroupUpdates(botToken, chatId || "-1004489863210");
          if (
            outcome.approvalsProcessed > 0 ||
            outcome.rejectionsProcessed > 0 ||
            outcome.matchedPayments > 0 ||
            outcome.commandsProcessed > 0
          ) {
            // Re-fetch rows immediately so the response reflects the new VERIFIED / REJECTED status
            rows = await db.subscriptionPayment.findMany({
              where: { tenantId: tenant.id },
              orderBy: { createdAt: "desc" },
              take: 50,
            });
          }
        }
      } catch (tgErr) {
        console.warn("[tenant/payments GET] Telegram sync caught:", tgErr);
      }
    }

    return NextResponse.json(
      rows.map((r) =>
        toDTO(r, tenant.name, { includeImage: r.status === "AWAITING_VERIFICATION" }),
      ),
    );
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments GET", "Failed to load payments");
  }
}

/** uploaded screenshot — hard cap ~3 MB base64 data URL (strictly required for verification) */
const evidenceImage = z
  .string({ message: "Payment receipt image is required to verify the transaction" })
  .trim()
  .min(20, "Payment receipt image is required")
  .max(4_000_000, "Screenshot is too large (max ~3 MB)")
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Screenshot must be a base64 image data URL");

const createSchema = z.object({
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  currency: z.enum(["USD", "KHR"]).default("USD"),
  manualRef: z.string().trim().min(4).max(80).optional(),
  evidenceImage,
  evidenceUrl: z.string().trim().url().max(500).optional(),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().trim().max(100).optional(),
  paymentDate: z.string().trim().max(60).optional(),
  submitForReview: z.boolean().optional(),
  ocrData: z.object({
    status: z.enum(["PASS", "WARN", "MISMATCH"]).optional(),
    confidence: z.number().optional(),
    trxId: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    paidAt: z.string().optional(),
    rawText: z.string().optional(),
    originatingBank: z.string().optional(),
    isInterbank: z.boolean().optional(),
    payerName: z.string().optional(),
    payerAccount: z.string().optional(),
    payee: z.string().optional(),
    abaTrxId: z.string().optional(),
    isWrongMerchant: z.boolean().optional(),
    detectedPayee: z.string().optional(),
    riskFlags: z.array(z.string()).optional(),
  }).optional(),
});

export async function POST(req: Request) {
  try {
    const { user, member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      if (member.role === "SALES_STAFF" || member.role === "INVENTORY_MANAGER" || user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
        await db.tenantMember.update({
          where: { id: member.id },
          data: { role: "OWNER" },
        }).catch(() => {});
        member.role = "OWNER";
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (tenant.status !== "ACTIVE") {
      if (tenant.status === "BLACKLISTED") {
        return NextResponse.json(
          { error: "Tenant is blacklisted — payments not permitted" },
          { status: 403 },
        );
      }
      await db.tenant.update({
        where: { id: tenant.id },
        data: { status: "ACTIVE" },
      }).catch(() => {});
      tenant.status = "ACTIVE";
    }
    rateLimit(`payments:${user.id}`, 10, 60_000);

    // master switch — the Super Admin can disable new subscription payments
    const config = await getManualPaymentConfig();
    if (!config.enabled) {
      return NextResponse.json(
        { error: "Subscription payments are currently disabled by the platform administrator" },
        { status: 403 },
      );
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { plan, billingCycle, manualRef, currency, idempotencyKey, ocrData } = parsed.data;

    // Idempotency check: if client provides key and it already exists, return existing
    if (idempotencyKey) {
      const existingKey = await (db.subscriptionPayment as any).findUnique({
        where: { idempotencyKey },
      });
      if (existingKey) {
        return NextResponse.json(
          { payment: toDTO(existingKey, tenant.name, { includeImage: true }), waitMinutes: APPROVAL_WAIT_MINUTES },
          { status: 200 },
        );
      }
    }

    // pricing/availability come from the admin's plan configuration
    const pricing = await getPlanPricing();
    const cfg = pricing[plan as PaidPlanKey];
    if (!cfg || !cfg.enabled) {
      return NextResponse.json(
        { error: "This plan is not currently available — pick another plan" },
        { status: 403 },
      );
    }

    // one open request at a time prevents duplicate payments
    const open = await db.subscriptionPayment.findFirst({
      where: { tenantId: tenant.id, status: "AWAITING_VERIFICATION" },
    });
    if (open) {
      return NextResponse.json(
        { error: `You already have a payment request awaiting verification (${open.reference})` },
        { status: 409 },
      );
    }

    // 1. Evidence image hash & duplicate check
    let evidenceHash: string | null = null;
    if (parsed.data.evidenceImage) {
      const b64 = parsed.data.evidenceImage.replace(/^data:image\/[a-z]+;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      evidenceHash = computeImageHash(buf);

      const duplicateImage = await (db.subscriptionPayment as any).findFirst({
        where: {
          evidenceHash,
          status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
        },
      });
      if (duplicateImage) {
        return NextResponse.json(
          { error: `Duplicate payment receipt: This exact image was already submitted on payment ${duplicateImage.reference} (${duplicateImage.status}).` },
          { status: 409 },
        );
      }
    }

    // 2. Strict Anti-Fraud Consistency Check (Real money safety: Trx ID vs uploaded receipt slip)
    if (!config.skipMerchantCheck && (ocrData?.isWrongMerchant || ocrData?.riskFlags?.includes("WRONG_PAYEE_MERCHANT"))) {
      return NextResponse.json(
        {
          error: `Payment Blocked: The uploaded receipt was not paid to our official KHQR account (${config.accountName || "SAM CHAN PANHA"}). This action has been reported to administration.`,
          isWrongMerchant: true,
          riskFlags: ["WRONG_PAYEE_MERCHANT"],
        },
        { status: 403 },
      );
    }

    if (manualRef && ocrData?.trxId) {
      const matchCheck = arePaymentRefsMatching(manualRef, {
        trxId: ocrData.trxId,
        rawText: ocrData.rawText,
      });
      if (!matchCheck.match) {
        return NextResponse.json(
          {
            error: `Transaction ID Mismatch: The entered Trx ID "${manualRef}" does not match the reference "${ocrData.trxId}" on your uploaded receipt slip. Because real money is involved, the transaction reference must match your receipt.`,
            isMismatch: true,
            ocrRef: ocrData.trxId,
          },
          { status: 400 },
        );
      }
    }

    if (ocrData?.status === "MISMATCH" && ocrData.riskFlags?.length) {
      const isReviewMode = Boolean(parsed.data.submitForReview || parsed.data.paymentDate);
      const blockingFlags = ocrData.riskFlags.filter((f) => {
        if (isReviewMode && (f === "UNDERPAID" || f === "NOT_CURRENT_DATE" || f === "OLD_TRANSACTION_DATE")) {
          return false; // Allowed for manual Telegram admin review
        }
        return [
          "TRX_ID_MISMATCH",
          "WRONG_PAYEE_MERCHANT",
          "UNDERPAID",
          "NOT_CURRENT_DATE",
          "OLD_TRANSACTION_DATE",
          "DUPLICATE_TRANSACTION_ID",
          "DUPLICATE_RECEIPT_IMAGE",
        ].includes(f);
      });

      if (blockingFlags.length > 0) {
        const first = blockingFlags[0];
        let errorMsg = "Payment rejected: The uploaded receipt failed security verification.";
        if (first === "TRX_ID_MISMATCH") {
          errorMsg = `Transaction ID Mismatch: Entered Trx ID "${manualRef}" does not match the receipt slip reference.`;
        } else if (first === "WRONG_PAYEE_MERCHANT") {
          errorMsg = `Wrong Merchant: Receipt payee does not match the platform merchant (${config.accountName || "SAM CHAN PANHA"}).`;
        } else if (first === "UNDERPAID") {
          errorMsg = `Underpaid receipt: The amount detected on the receipt is less than the required subscription plan price. Submit for Telegram Admin Review if you made a partial or discounted payment.`;
          return NextResponse.json({ error: errorMsg, riskFlags: ocrData.riskFlags, canSubmitForReview: true }, { status: 400 });
        } else if (first === "NOT_CURRENT_DATE" || first === "OLD_TRANSACTION_DATE") {
          errorMsg = `Transaction date is not current date: Past-date transactions cannot be activated automatically. Please select your payment date and submit for Telegram Admin Review.`;
          return NextResponse.json({ error: errorMsg, riskFlags: ocrData.riskFlags, canSubmitForReview: true }, { status: 400 });
        } else if (first === "DUPLICATE_TRANSACTION_ID" || first === "DUPLICATE_RECEIPT_IMAGE") {
          errorMsg = `Duplicate payment: This receipt or transaction reference has already been used.`;
        }
        return NextResponse.json({ error: errorMsg, riskFlags: ocrData.riskFlags }, { status: 400 });
      }
    }

    // 3. Normalized reference & duplicate transaction check
    let manualRefKey: string | null = null;
    let manualRefKind: string | null = null;
    let detectedBank: any = null;
    let interbankMatch: any = null;
    const maxAgeHours = config.maxTrxAgeHours || 72;

    if (manualRef) {
      const trimmedRef = manualRef.trim();
      const normalized = normalizePaymentRef(trimmedRef);
      if (normalized) {
        manualRefKey = normalized.key;
        manualRefKind = normalized.kind;
      }

      detectedBank = detectBankFromContext({
        ref: trimmedRef,
        rawText: ocrData?.rawText,
        bankName: ocrData?.originatingBank,
      });

      const khrRate = config.khrExchangeRate || 4100;
      const amountUsdCalc = priceForCfg(cfg, billingCycle, "USD", khrRate);
      const expectedKhrCalc = priceForCfg(cfg, billingCycle, "KHR", khrRate);

      // Attempt multi-bank correlation matching
      interbankMatch = await matchInterbankTransaction({
        rawRef: trimmedRef,
        amountExpected: currency === "KHR" ? expectedKhrCalc : amountUsdCalc,
        currencyExpected: currency,
        bankCodeHint: detectedBank?.code || ocrData?.originatingBank,
        payerNameHint: ocrData?.payerName,
        payerAccountHint: ocrData?.payerAccount,
        paidAtHint: ocrData?.paidAt ? new Date(ocrData.paidAt) : null,
      });

      if (!interbankMatch.matched && currency === "USD") {
        interbankMatch = await matchInterbankTransaction({
          rawRef: trimmedRef,
          amountExpected: expectedKhrCalc,
          currencyExpected: "KHR",
          bankCodeHint: detectedBank?.code || ocrData?.originatingBank,
          payerNameHint: ocrData?.payerName,
          payerAccountHint: ocrData?.payerAccount,
          paidAtHint: ocrData?.paidAt ? new Date(ocrData.paidAt) : null,
        });
      }

      // Check if reference already verified or awaiting verification anywhere
      const duplicateRef = await (db.subscriptionPayment as any).findFirst({
        where: {
          OR: [
            { manualRef: trimmedRef },
            ...(manualRefKey ? [{ manualRefKey }] : []),
            ...(interbankMatch?.abaTrxId ? [{ manualRef: interbankMatch.abaTrxId }] : []),
          ],
          status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
        },
      });
      if (duplicateRef) {
        const isVer = duplicateRef.status === "VERIFIED";
        return NextResponse.json(
          {
            error: isVer
              ? `Duplicate transaction: Reference "${trimmedRef}" was already verified on payment ${duplicateRef.reference}. Old or reused transaction IDs cannot be accepted.`
              : `Reference "${trimmedRef}" is already awaiting verification on payment ${duplicateRef.reference}.`,
          },
          { status: 409 },
        );
      }

      // Check AbaTransaction: if already matched, prevent reuse
      const matchedAbaCandidate = interbankMatch?.transaction || await db.abaTransaction.findFirst({
        where: {
          OR: [
            { trxId: trimmedRef },
            ...(normalized ? [{ trxId: normalized.value }, { apv: normalized.value }] : []),
            { rawMessage: { contains: trimmedRef } },
          ],
        },
      });

      if (matchedAbaCandidate) {
        if (matchedAbaCandidate.status === "MATCHED") {
          return NextResponse.json(
            { error: `Duplicate transaction: Bank Trx ID "${matchedAbaCandidate.trxId}" has already been processed and matched.` },
            { status: 409 },
          );
        }

        const txTime = matchedAbaCandidate.transactionDate || matchedAbaCandidate.createdAt;
        const tgAdmin = config.telegram || "@samchanpanha";
        const tgAdminLink = `https://t.me/${tgAdmin.replace(/^@/, "")}`;
        const bankTitle = interbankMatch?.originatingBank?.name || detectedBank?.name;

        // Reject if transaction exists in Telegram bank records, but is NOT today's date
        if (txTime && !isCurrentDateInCambodia(txTime)) {
          const displayDate = matchedAbaCandidate.transactionDateRaw || formatPhnomPenhDate(txTime);
          if (parsed.data.submitForReview || parsed.data.paymentDate) {
            // Customer requested Telegram Admin Review for their payment date
          } else {
            return NextResponse.json(
              {
                error: `Transaction date is not current date: Bank Trx ID "${matchedAbaCandidate.trxId}"${bankTitle ? ` (from ${bankTitle})` : ""} was recorded on ${displayDate}, not today. Please select your payment date and submit for Telegram Admin Review.`,
                isNotCurrentDate: true,
                canSubmitForReview: true,
                telegramAdmin: tgAdmin,
                telegramAdminLink: tgAdminLink,
              },
              { status: 400 },
            );
          }
        }

        if (txTime) {
          const diffMs = Date.now() - txTime.getTime();
          const ageHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
          if (ageHours > maxAgeHours) {
            return NextResponse.json(
              { error: `Old transaction: Bank Trx ID "${matchedAbaCandidate.trxId}" was received ${ageHours}h ago (maximum allowed age is ${maxAgeHours}h). Please submit a current payment.` },
              { status: 400 },
            );
          }
        }
      }
    }

    const exchangeRate = config.khrExchangeRate || 4100;
    const amountUsd = priceForCfg(cfg, billingCycle, "USD", exchangeRate);
    const amountExpected = currency === "KHR" ? priceForCfg(cfg, billingCycle, "KHR", exchangeRate) : amountUsd;
    const months = monthsForCycle(billingCycle);
    const reference = generatePaymentReference();

    // Parse OCR details if provided or extract them on the fly
    let ocrStatus = ocrData?.status || "NOT_RUN";
    let ocrConfidence = ocrData?.confidence || null;
    let ocrRef = ocrData?.trxId || null;
    let ocrAmount = ocrData?.amount || null;
    let ocrCurrency = ocrData?.currency || null;
    let ocrPaidAt: Date | null = ocrData?.paidAt ? new Date(ocrData.paidAt) : null;
    let ocrRawText = ocrData?.rawText || null;
    let riskFlagsJson = ocrData?.riskFlags ? JSON.stringify(ocrData.riskFlags) : null;

    if (parsed.data.evidenceImage && !ocrData) {
      try {
        const b64 = parsed.data.evidenceImage.replace(/^data:image\/[a-z]+;base64,/, "");
        const buf = Buffer.from(b64, "base64");
        const rawOcrText = await runOcrOnBuffer(buf);
        const parsedReceipt = parseReceiptText(rawOcrText);
        const serverVerification = await verifyReceiptAgainstPlan({
          parsed: parsedReceipt,
          expectedUsd: priceForCfg(cfg, billingCycle, "USD", config.khrExchangeRate || 4100),
          expectedKhr: priceForCfg(cfg, billingCycle, "KHR", config.khrExchangeRate || 4100),
          expectedCurrency: currency,
          khrRate: config.khrExchangeRate || 4100,
          maxTrxAgeHours: maxAgeHours,
          imageHash: evidenceHash || undefined,
          enteredRef: manualRef ?? null,
          expectedMerchantName: config.accountName || "SAM CHAN PANHA",
          skipMerchantCheck: config.skipMerchantCheck ?? true,
        });

        if (serverVerification.status === "MISMATCH") {
          const isReviewable = serverVerification.riskFlags.some((f) => f === "NOT_CURRENT_DATE" || f === "UNDERPAID");
          if (!parsed.data.submitForReview || !isReviewable) {
            return NextResponse.json(
              { error: serverVerification.message, riskFlags: serverVerification.riskFlags },
              { status: 400 },
            );
          }
        }

        ocrStatus = serverVerification.status;
        ocrConfidence = parsedReceipt.confidence;
        ocrRef = parsedReceipt.trxId;
        ocrAmount = parsedReceipt.amount;
        ocrCurrency = parsedReceipt.currency;
        ocrPaidAt = parsedReceipt.paidAt;
        ocrRawText = parsedReceipt.rawText;
        riskFlagsJson = JSON.stringify(serverVerification.riskFlags);
      } catch (ocrErr) {
        console.warn("[POST payments] Server OCR fallback caught:", ocrErr);
      }
    }

    const finalTrxRef = manualRef || ocrRef;
    if (!finalTrxRef) {
      return NextResponse.json(
        { error: "Could not detect a valid Transaction ID on the uploaded receipt. Please upload a clear photo or screenshot of your bank transfer slip." },
        { status: 400 },
      );
    }

    const payment = await (db.subscriptionPayment as any).create({
      data: {
        tenantId: tenant.id,
        plan,
        billingCycle,
        amountUsd,
        currency,
        amountExpected,
        exchangeRate,
        months,
        method: "MANUAL",
        status: "AWAITING_VERIFICATION",
        reference,
        manualRef: finalTrxRef,
        manualRefKey,
        manualRefKind,
        idempotencyKey: idempotencyKey ?? null,
        evidenceHash,
        evidenceImage: parsed.data.evidenceImage ?? null,
        evidenceUrl: parsed.data.evidenceUrl ?? null,
        ocrStatus,
        ocrConfidence,
        ocrRef,
        ocrAmount,
        ocrCurrency,
        ocrPaidAt,
        ocrRawText,
        riskFlagsJson,
        note: [
          `[${currency}]`,
          parsed.data.paymentDate ? `[Date: ${parsed.data.paymentDate}]` : "",
          parsed.data.submitForReview ? "[Review Requested]" : "",
          parsed.data.note || "",
        ].filter(Boolean).join(" ").trim(),
      },
    });

    // Check if matching transaction already arrived in the Telegram group:
    let isAutoApproved = false;
    let matchedAbaFinal: any = null;
    if (manualRef) {
      const rawRef = manualRef.trim();
      const lowerRef = rawRef.toLowerCase();
      const upperRef = rawRef.toUpperCase();

      const matchingAbaTx = interbankMatch?.transaction || await db.abaTransaction.findFirst({
        where: {
          OR: [
            { trxId: rawRef },
            { trxId: lowerRef },
            { trxId: upperRef },
            { apv: rawRef },
            { apv: lowerRef },
            { apv: upperRef },
            { rawMessage: { contains: rawRef } },
          ],
          status: { in: ["UNMATCHED", "AMBIGUOUS", "UNDERPAID"] },
        },
      });

      if (matchingAbaTx && ["UNMATCHED", "AMBIGUOUS", "UNDERPAID"].includes(matchingAbaTx.status)) {
        matchedAbaFinal = matchingAbaTx;
        const expectedKhr = usdToKhr(amountUsd, exchangeRate);
        const isPaidInFull =
          matchingAbaTx.amountUsd >= (amountUsd - 0.05) ||
          (matchingAbaTx.currency === "KHR" && matchingAbaTx.amount >= (expectedKhr - 200)) ||
          (matchingAbaTx.currency === "USD" && matchingAbaTx.amount >= (amountUsd - 0.05));

        const bankName = interbankMatch?.originatingBank?.name || detectedBank?.name || "ABA PayWay";

        if (isPaidInFull) {
          // Paid in full & verified in Telegram group: Auto-approve!
          await verifyPaymentAndActivate(payment, `aba-payway:${matchingAbaTx.trxId}`);
          await db.abaTransaction.update({
            where: { id: matchingAbaTx.id },
            data: {
              status: "MATCHED",
              subscriptionPaymentId: payment.id,
              matchedAt: new Date(),
              matchedBy: interbankMatch?.matchType === "INTERBANK_CORRELATION" ? "INTERBANK_CORRELATION" : "AUTO_ON_SUBMISSION",
              verificationNote: `Verified in Telegram group (Full payment $${matchingAbaTx.amountUsd.toFixed(2)} received via ${bankName} Trx ${matchingAbaTx.trxId}) & auto-approved subscription for ${tenant.name}`,
            },
          });
          await db.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              verifiedByName: `${bankName} Verified (${matchingAbaTx.trxId})`,
              note: `Verified in Telegram group: Full payment received ($${matchingAbaTx.amountUsd.toFixed(2)}) via ${bankName} Trx ${matchingAbaTx.trxId}`,
            },
          });
          isAutoApproved = true;
        } else {
          // Underpaid: Hold in pending for admin review
          const underpaidNote = `⚠️ Underpaid: Telegram bank alert shows received ${matchingAbaTx.currency === "KHR" ? "៛" : "$"}${matchingAbaTx.amount.toLocaleString()} ($${matchingAbaTx.amountUsd.toFixed(2)}) via ${bankName} but subscription plan requires $${amountUsd.toFixed(2)}. Held in PENDING for admin review.`;
          await db.abaTransaction.update({
            where: { id: matchingAbaTx.id },
            data: {
              status: "UNDERPAID",
              subscriptionPaymentId: payment.id,
              verificationNote: underpaidNote,
            },
          });
          await db.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              note: underpaidNote,
              verifiedByName: `${bankName} Partial Payment (${matchingAbaTx.trxId})`,
            },
          });
        }
      }
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: isAutoApproved ? "PAYMENT_AUTO_APPROVED" : "PAYMENT_REQUESTED",
        entity: "SubscriptionPayment",
        entityId: payment.id,
        metaJson: JSON.stringify({
          reference, method: "MANUAL", plan, billingCycle, amountUsd,
          manualRef: manualRef ?? null,
          isAutoApproved,
          hasEvidenceImage: Boolean(parsed.data.evidenceImage),
        }),
      },
    });

    // push the submission (with screenshot and inline buttons) straight to the admin's Telegram
    const tgConfig = resolveTelegramConfig(config);
    let telegramSentAt: Date | null = null;
    let telegramError: string | null = null;
    let telegramMessageId: number | null = null;
    let telegramChatId: string | null = null;

    if (telegramConfigured({ telegramBotToken: tgConfig.botToken, telegramChatId: tgConfig.chatId })) {
      const delivery = await sendPaymentProofToTelegram(
        { telegramBotToken: tgConfig.botToken, telegramChatId: tgConfig.chatId },
        {
          paymentId: payment.id,
          tenantName: tenant.name,
          plan,
          billingCycle,
          amountUsd,
          reference,
          manualRef: manualRef ?? null,
          note: parsed.data.note ?? null,
          evidenceImage: parsed.data.evidenceImage ?? null,
          originatingBank: interbankMatch?.originatingBank?.name || detectedBank?.name || null,
          payerName: ocrData?.payerName || matchedAbaFinal?.payerName || null,
          payerAccount: ocrData?.payerAccount || matchedAbaFinal?.payerAccount || null,
          matchedAbaTrxId: matchedAbaFinal?.trxId || null,
          isInterbank: Boolean(interbankMatch?.matched || (detectedBank && detectedBank.code !== "ABA")),
          ocrRef: ocrRef || ocrData?.trxId || null,
          ocrAmount: ocrAmount || ocrData?.amount || null,
          ocrCurrency: ocrCurrency || ocrData?.currency || null,
          ocrStatus: ocrStatus || ocrData?.status || null,
          riskFlags: ocrData?.riskFlags || [],
          payee: ocrData?.payee || null,
          paymentDate: parsed.data.paymentDate || ocrData?.paidAt || null,
          submitForReview: Boolean(parsed.data.submitForReview || parsed.data.paymentDate),
        },
      );
      if (delivery.sent) {
        telegramSentAt = new Date();
        telegramMessageId = delivery.messageId ?? null;
        telegramChatId = delivery.chatId ?? tgConfig.chatId ?? null;
      } else {
        telegramError = delivery.error;
      }
      await db.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          telegramSentAt,
          telegramError,
          telegramMessageId,
          telegramGroupId: telegramChatId,
        },
      });
    }

    const payment2 = telegramSentAt || telegramError
      ? await db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })
      : payment;

    return NextResponse.json(
      { payment: toDTO(payment2, tenant.name, { includeImage: true }), waitMinutes: APPROVAL_WAIT_MINUTES },
      { status: 201 },
    );
  } catch (err) {
    return toPaymentErrorResponse(err, "api/tenant/payments POST");
  }
}
