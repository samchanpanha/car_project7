import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { getPlanPricing, priceForCfg, type PaidPlanKey } from "@/lib/api/plan-config";
import { getManualPaymentConfig, resolveTelegramConfig } from "@/lib/api/payments";
import { sendFraudAlertToTelegram } from "@/lib/api/telegram-notify";
import {
  computeImageHash,
  parseReceiptText,
  runOcrOnBuffer,
  verifyReceiptAgainstPlan,
} from "@/lib/payments/ocr";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ocrSchema = z.object({
  image: z
    .string()
    .trim()
    .max(3_000_000, "Image is too large (max ~2 MB)")
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Must be a base64 image data URL"),
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
  cycle: z.enum(["MONTHLY", "YEARLY"]),
  currency: z.enum(["USD", "KHR"]).default("USD"),
  enteredRef: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const { user, tenant } = await requireTenantMember();
    rateLimit(`payments:ocr:${user.id}`, 20, 60_000);

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ocrSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid image or plan payload" }, { status: 400 });
    }

    const { image, plan, cycle, currency, enteredRef } = parsed.data;

    // Decode base64 buffer
    const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const imageHash = computeImageHash(imageBuffer);

    // Plan pricing config
    const pricing = await getPlanPricing();
    const cfg = pricing[plan as PaidPlanKey];
    if (!cfg) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }
    // Payment config (exchange rate, max age)
    const paymentConfig = await getManualPaymentConfig();
    const khrRate = paymentConfig.khrExchangeRate || 4100;
    const expectedUsd = priceForCfg(cfg, cycle, "USD", khrRate);
    const expectedKhr = priceForCfg(cfg, cycle, "KHR", khrRate);

    // 1. Run OCR on image
    const rawText = await runOcrOnBuffer(imageBuffer);

    // 2. Parse receipt fields
    const receiptData = parseReceiptText(rawText);

    // 3. Verify against plan, duplicate check, age limit, entered ref, and merchant name
    const verification = await verifyReceiptAgainstPlan({
      parsed: receiptData,
      expectedUsd,
      expectedKhr,
      expectedCurrency: currency,
      khrRate,
      maxTrxAgeHours: paymentConfig.maxTrxAgeHours || 72,
      imageHash,
      enteredRef: enteredRef ?? null,
      expectedMerchantName: paymentConfig.accountName || "SAM CHAN PANHA",
      skipMerchantCheck: paymentConfig.skipMerchantCheck ?? true,
    });

    let fraudAlertId: string | null = null;

    // 4. Security Enforcement: If slip is not paid to our official KHQR (foreign/fake payee),
    // immediately log a security fraud alert and notify Telegram with [Cancel] & [Blacklist User] buttons.
    if (!paymentConfig.skipMerchantCheck && verification.isWrongMerchant) {
      try {
        const detectedPayeeName = verification.detectedPayee || receiptData.payee || "Foreign Account";
        const expectedPayeeName = verification.expectedMerchant || paymentConfig.accountName || "SAM CHAN PANHA";

        const alertRecord = await (db as any).fraudAlert.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            reason: "WRONG_PAYEE_MERCHANT",
            detectedPayee: detectedPayeeName,
            expectedPayee: expectedPayeeName,
            amount: receiptData.amount,
            currency: receiptData.currency || currency,
            slipRef: receiptData.trxId || receiptData.externalRef || receiptData.apv,
            slipDateRaw: receiptData.paidAtRaw,
            evidenceImage: image,
            status: "PENDING",
          },
        });
        fraudAlertId = alertRecord.id;

        const tgMeta = resolveTelegramConfig(paymentConfig);
        const tgConfig = { telegramBotToken: tgMeta.botToken, telegramChatId: tgMeta.chatId };
        const tgDelivery = await sendFraudAlertToTelegram(tgConfig, {
          alertId: alertRecord.id,
          userId: user.id,
          tenantId: tenant.id,
          tenantName: tenant.name,
          userName: user.name,
          userPhone: user.phone,
          userEmail: user.email,
          reason: "Payment slip was paid to an unauthorized foreign merchant",
          detectedPayee: detectedPayeeName,
          expectedPayee: expectedPayeeName,
          amount: receiptData.amount,
          currency: receiptData.currency || currency,
          slipRef: receiptData.trxId || receiptData.externalRef || receiptData.apv,
          slipDateRaw: receiptData.paidAtRaw,
          evidenceImage: image,
        });

        if (tgDelivery.messageId) {
          await (db as any).fraudAlert.update({
            where: { id: alertRecord.id },
            data: {
              telegramMsgId: tgDelivery.messageId,
              telegramChatId: tgMeta.chatId,
            },
          });
        }
      } catch (alertErr) {
        console.error("[Fraud Alert Dispatch] Failed to record or notify:", alertErr);
      }
    }

    return NextResponse.json({
      success: !verification.isWrongMerchant,
      blocked: verification.isWrongMerchant,
      isWrongMerchant: verification.isWrongMerchant,
      fraudAlertId,
      imageHash,
      data: {
        trxId: receiptData.trxId,
        externalRef: receiptData.externalRef,
        apv: receiptData.apv,
        amount: receiptData.amount,
        currency: receiptData.currency || currency,
        amountUsd: receiptData.amountUsd,
        amountKhr: receiptData.amountKhr,
        paidAt: receiptData.paidAt?.toISOString() ?? null,
        paidAtRaw: receiptData.paidAtRaw,
        payerName: receiptData.payerName,
        payerAccount: receiptData.payerAccount,
        payee: receiptData.payee,
        beneficiaryBank: receiptData.beneficiaryBank,
        bankName: receiptData.bankName,
        bankCode: receiptData.bankCode,
        isInterbank: receiptData.isInterbank,
        confidence: receiptData.confidence,
        rawText: receiptData.rawText,
      },
      verification,
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/ocr POST", "Failed to process receipt image");
  }
}
