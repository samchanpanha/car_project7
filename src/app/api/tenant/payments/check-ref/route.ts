import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { normalizePaymentRef, isCurrentDateInCambodia, formatPhnomPenhDate } from "@/lib/payments/reference";
import { getManualPaymentConfig } from "@/lib/api/payments";
import { getPlanPricing, priceForCfg, type PaidPlanKey } from "@/lib/api/plan-config";
import { matchInterbankTransaction, detectBankFromContext } from "@/lib/payments/interbank-matcher";
import { arePaymentRefsMatching } from "@/lib/payments/ocr";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireTenantMember();
    const url = new URL(req.url);
    const rawRef = url.searchParams.get("ref")?.trim() || "";
    const ocrRef = url.searchParams.get("ocrRef")?.trim() || "";
    const plan = url.searchParams.get("plan") || "PRO";
    const cycle = (url.searchParams.get("cycle") || "MONTHLY") as "MONTHLY" | "YEARLY";
    const userCurrency = (url.searchParams.get("currency") || "USD") as "USD" | "KHR";
    const payerAccount = url.searchParams.get("payerAccount")?.trim() || null;
    const payerName = url.searchParams.get("payerName")?.trim() || null;
    const bankHint = url.searchParams.get("bank")?.trim() || "";

    if (!rawRef || rawRef.length < 4) {
      return NextResponse.json({
        valid: false,
        canSubmit: false,
        message: "Reference must be at least 4 characters",
      });
    }

    // Check reference consistency if OCR slip reference is also provided
    if (rawRef && ocrRef) {
      const matchOutcome = arePaymentRefsMatching(rawRef, { trxId: ocrRef });
      if (!matchOutcome.match) {
        return NextResponse.json({
          valid: false,
          canSubmit: false,
          isMismatch: true,
          ocrRef,
          message: `Transaction ID Mismatch: The entered Trx ID "${rawRef}" does not match the uploaded receipt slip reference ("${ocrRef}").`,
        });
      }
    }

    const config = await getManualPaymentConfig();
    const tgAdmin = config.telegram || "@samchanpanha";
    const tgAdminLink = `https://t.me/${tgAdmin.replace(/^@/, "")}`;
    const maxAgeHours = config.maxTrxAgeHours || 72;

    const normalized = normalizePaymentRef(rawRef);
    if (!normalized) {
      return NextResponse.json({
        valid: false,
        canSubmit: false,
        message: "Invalid transaction reference format",
      });
    }

    const detectedBank = detectBankFromContext({ ref: rawRef, bankName: bankHint });

    // 1. Check SubscriptionPayment for previous duplicate submissions
    const existingPayment = await (db.subscriptionPayment as any).findFirst({
      where: {
        OR: [
          { manualRef: rawRef },
          { manualRef: normalized.value },
          { manualRefKey: normalized.key },
        ],
        status: { in: ["VERIFIED", "AWAITING_VERIFICATION"] },
      },
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
      },
    });

    if (existingPayment) {
      const isVerified = existingPayment.status === "VERIFIED";
      return NextResponse.json({
        valid: false,
        canSubmit: false,
        duplicate: true,
        status: existingPayment.status,
        paymentRef: existingPayment.reference,
        message: isVerified
          ? `Duplicate transaction: Reference "${rawRef}" was already verified on payment ${existingPayment.reference}.`
          : `Reference "${rawRef}" has already been submitted and is currently awaiting verification (${existingPayment.reference}).`,
      });
    }

    // 2. Check AbaTransaction table with Multi-Bank Interbank Correlation (ACLEDA, Wing, Canadia, etc.)
    const pricing = await getPlanPricing();
    const cfg = pricing[plan as PaidPlanKey];
    const khrRate = config.khrExchangeRate || 4100;
    const requiredUsd = cfg ? priceForCfg(cfg, cycle, "USD", khrRate) : 49;
    const requiredKhr = cfg ? priceForCfg(cfg, cycle, "KHR", khrRate) : Math.round((requiredUsd * khrRate) / 100) * 100;

    // Run interbank matcher with USD or KHR amounts
    let interbank = await matchInterbankTransaction({
      rawRef,
      amountExpected: userCurrency === "KHR" ? requiredKhr : requiredUsd,
      currencyExpected: userCurrency,
      bankCodeHint: detectedBank?.code,
      payerNameHint: payerName,
      payerAccountHint: payerAccount,
    });

    if (!interbank.matched && userCurrency === "USD") {
      // Also try matching against KHR equivalent
      interbank = await matchInterbankTransaction({
        rawRef,
        amountExpected: requiredKhr,
        currencyExpected: "KHR",
        bankCodeHint: detectedBank?.code,
        payerNameHint: payerName,
        payerAccountHint: payerAccount,
      });
    }

    const existingAba = interbank.transaction || await db.abaTransaction.findFirst({
      where: {
        OR: [
          { trxId: rawRef },
          { trxId: normalized.value },
          { apv: rawRef },
          { apv: normalized.value },
          { rawMessage: { contains: rawRef } },
        ],
      },
      select: {
        id: true,
        trxId: true,
        apv: true,
        amount: true,
        amountUsd: true,
        currency: true,
        status: true,
        transactionDate: true,
        transactionDateRaw: true,
        createdAt: true,
      },
    });

    const isInterbank = interbank.matched
      ? interbank.originatingBank?.code !== "ABA"
      : Boolean(detectedBank && detectedBank.code !== "ABA");
    const originatingBankName = interbank.originatingBank?.name || detectedBank?.name;

    if (existingAba) {
      const txTime = existingAba.transactionDate || existingAba.createdAt;

      // Date check: Is transaction date the CURRENT DATE (in Cambodia Asia/Phnom_Penh)?
      if (txTime && !isCurrentDateInCambodia(txTime)) {
        const formattedTxDate = formatPhnomPenhDate(txTime);
        const displayDate = existingAba.transactionDateRaw || formattedTxDate;
        return NextResponse.json({
          valid: false,
          canSubmit: false,
          isNotCurrentDate: true,
          isInterbank,
          originatingBank: originatingBankName,
          trxId: existingAba.trxId,
          transactionDate: txTime.toISOString(),
          transactionDateFormatted: formattedTxDate,
          transactionDateRaw: existingAba.transactionDateRaw,
          telegramAdmin: tgAdmin,
          telegramAdminLink: tgAdminLink,
          message: `⚠️ Transaction ${existingAba.trxId} was found in Telegram bank group${originatingBankName ? ` (from ${originatingBankName})` : ""}, but its date (${displayDate}) is not today's date. Past-date transactions cannot be submitted. Please contact Admin on Telegram (${tgAdmin}).`,
        });
      }

      // Age check: Is transaction older than maxAgeHours?
      if (txTime) {
        const diffMs = Date.now() - txTime.getTime();
        const ageHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        if (ageHours > maxAgeHours) {
          return NextResponse.json({
            valid: false,
            canSubmit: false,
            duplicate: false,
            isOld: true,
            ageHours,
            telegramAdmin: tgAdmin,
            telegramAdminLink: tgAdminLink,
            message: `Old transaction: This transaction was processed ${ageHours}h ago (limit is ${maxAgeHours}h). Please submit a fresh payment.`,
          });
        }
      }

      if (existingAba.status === "MATCHED") {
        return NextResponse.json({
          valid: false,
          canSubmit: false,
          duplicate: true,
          status: "MATCHED",
          message: `Duplicate transaction: Bank Trx ID "${existingAba.trxId}" has already been matched to a subscription.`,
        });
      }

      // Check if matching transaction in group can auto-approve!
      const isPaidInFull =
        existingAba.amountUsd >= (requiredUsd - 0.05) ||
        (existingAba.currency === "KHR" && existingAba.amount >= (requiredKhr - 200)) ||
        (existingAba.currency === "USD" && existingAba.amount >= (requiredUsd - 0.05));

      return NextResponse.json({
        valid: true,
        canSubmit: true,
        duplicate: false,
        isOld: false,
        isNotCurrentDate: false,
        matchedAba: true,
        isInterbank,
        originatingBank: originatingBankName,
        abaTrxId: existingAba.trxId,
        isPaidInFull,
        requiredUsd,
        requiredKhr,
        receivedAmount: `${existingAba.currency === "KHR" ? "៛" : "$"}${existingAba.amount.toLocaleString()}`,
        message: isPaidInFull
          ? `⚡ Matched live ${originatingBankName || "ABA"} alert (${existingAba.currency === "KHR" ? "៛" : "$"}${existingAba.amount.toLocaleString()})! Auto-approval ready.`
          : `⚠️ Matched ${originatingBankName || "ABA"} alert, but amount (${existingAba.currency === "KHR" ? "៛" : "$"}${existingAba.amount.toLocaleString()}) is below required ($${requiredUsd.toFixed(2)} USD / ៛${requiredKhr.toLocaleString()} KHR).`,
      });
    }

    if (isInterbank && originatingBankName) {
      return NextResponse.json({
        valid: true,
        canSubmit: true,
        duplicate: false,
        isOld: false,
        isNotCurrentDate: false,
        matchedAba: false,
        isInterbank: true,
        originatingBank: originatingBankName,
        requiredUsd,
        requiredKhr,
        message: `Valid ${originatingBankName} reference detected. For fastest verification, attach your slip screenshot or Telegram bot will sync shortly.`,
      });
    }

    return NextResponse.json({
      valid: true,
      canSubmit: true,
      duplicate: false,
      isOld: false,
      isNotCurrentDate: false,
      matchedAba: false,
      requiredUsd,
      requiredKhr,
      message: "Valid & unused transaction reference.",
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/check-ref GET", "Failed to check reference");
  }
}
