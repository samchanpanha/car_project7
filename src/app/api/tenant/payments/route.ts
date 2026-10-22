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

export const dynamic = "force-dynamic";

/** How long manual approval usually takes — surfaced to the seller after submitting. */
export const APPROVAL_WAIT_MINUTES = 10;

function toDTO(
  p: {
    id: string; plan: string; billingCycle: string; amountUsd: number; months: number;
    method: string; status: string; reference: string; manualRef: string | null;
    evidenceUrl: string | null; evidenceImage: string | null; telegramSentAt: Date | null;
    telegramError: string | null; note: string | null; rejectionReason: string | null;
    tenantId: string; reviewedAt: Date | null; verifiedByName?: string | null; createdAt: Date;
  },
  tenantName?: string,
  opts?: { includeImage?: boolean },
): SubscriptionPaymentDTO {
  return {
    id: p.id,
    plan: p.plan as SubscriptionPaymentDTO["plan"],
    billingCycle: p.billingCycle as "MONTHLY" | "YEARLY",
    amountUsd: p.amountUsd,
    months: p.months,
    method: p.method as SubscriptionPaymentDTO["method"],
    status: p.status as SubscriptionPaymentDTO["status"],
    reference: p.reference,
    manualRef: p.manualRef,
    evidenceUrl: p.evidenceUrl,
    // the heavy image only travels to the admin queue; list views get the flag
    ...(opts?.includeImage ? { evidenceImage: p.evidenceImage } : { hasEvidenceImage: Boolean(p.evidenceImage) }),
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

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();
    const rows = await db.subscriptionPayment.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(rows.map((r) => toDTO(r, tenant.name)));
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments GET", "Failed to load payments");
  }
}

/** uploaded screenshot — hard cap ~1.2 MB binary, client downscales before sending */
const evidenceImage = z
  .string()
  .trim()
  .max(1_600_000, "Screenshot is too large (max ~1.2 MB)")
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Screenshot must be a base64 image data URL")
  .optional();

const createSchema = z
  .object({
    plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]),
    currency: z.enum(["USD", "KHR"]).default("USD"),
    manualRef: z.string().trim().min(4).max(80).optional(),
    evidenceImage,
    evidenceUrl: z.string().trim().url().max(500).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => Boolean(v.manualRef || v.evidenceImage || v.evidenceUrl), {
    message: "Attach a payment screenshot or enter the bank transaction reference",
  });

export async function POST(req: Request) {
  try {
    const { user, member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Tenant is suspended — subscriptions cannot be requested" },
        { status: 403 },
      );
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
    const { plan, billingCycle, manualRef, currency } = parsed.data;

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

    // Duplicate transaction check: Ensure this bank reference hasn't already been used & verified
    if (manualRef) {
      const trimmedRef = manualRef.trim();
      const duplicateVerified = await db.subscriptionPayment.findFirst({
        where: {
          manualRef: trimmedRef,
          status: "VERIFIED",
        },
      });
      if (duplicateVerified) {
        return NextResponse.json(
          { error: `Duplicate transaction: Bank reference "${trimmedRef}" was already verified on payment ${duplicateVerified.reference}.` },
          { status: 409 },
        );
      }

      const duplicateMatchedAba = await db.abaTransaction.findFirst({
        where: {
          trxId: trimmedRef,
          status: "MATCHED",
        },
      });
      if (duplicateMatchedAba) {
        return NextResponse.json(
          { error: `Duplicate transaction: Bank Trx ID "${trimmedRef}" has already been processed and matched.` },
          { status: 409 },
        );
      }
    }

    const amountUsd = priceForCfg(cfg, billingCycle);
    const expectedKhr = amountUsd * 4100;
    const months = monthsForCycle(billingCycle);
    const reference = generatePaymentReference();

    const payment = await db.subscriptionPayment.create({
      data: {
        tenantId: tenant.id,
        plan,
        billingCycle,
        amountUsd,
        months,
        method: "MANUAL",
        status: "AWAITING_VERIFICATION",
        reference,
        manualRef: manualRef ?? null,
        evidenceImage: parsed.data.evidenceImage ?? null,
        evidenceUrl: parsed.data.evidenceUrl ?? null,
        note: parsed.data.note ? `[${currency}] ${parsed.data.note}` : `[${currency}]`,
      },
    });

    // Check if matching transaction already arrived in the Telegram group:
    let isAutoApproved = false;
    if (manualRef) {
      const rawRef = manualRef.trim();
      const lowerRef = rawRef.toLowerCase();
      const upperRef = rawRef.toUpperCase();
      const matchingAbaTx = await db.abaTransaction.findFirst({
        where: {
          OR: [
            { trxId: rawRef },
            { trxId: lowerRef },
            { trxId: upperRef },
            { apv: rawRef },
            { apv: lowerRef },
            { apv: upperRef },
          ],
          status: { in: ["UNMATCHED", "AMBIGUOUS", "UNDERPAID"] },
        },
      });

      if (matchingAbaTx) {
        const isPaidInFull =
          matchingAbaTx.amountUsd >= (amountUsd - 0.05) ||
          (matchingAbaTx.currency === "KHR" && matchingAbaTx.amount >= (expectedKhr - 200)) ||
          (matchingAbaTx.currency === "USD" && matchingAbaTx.amount >= (amountUsd - 0.05));

        if (isPaidInFull) {
          // Paid in full & verified in Telegram group: Auto-approve!
          await verifyPaymentAndActivate(payment, `aba-payway:${matchingAbaTx.trxId}`);
          await db.abaTransaction.update({
            where: { id: matchingAbaTx.id },
            data: {
              status: "MATCHED",
              subscriptionPaymentId: payment.id,
              matchedAt: new Date(),
              matchedBy: "AUTO_ON_SUBMISSION",
              verificationNote: `Verified in Telegram group (Full payment $${matchingAbaTx.amountUsd.toFixed(2)} received) & auto-approved subscription for ${tenant.name}`,
            },
          });
          await db.subscriptionPayment.update({
            where: { id: payment.id },
            data: {
              verifiedByName: `ABA PayWay Verified (${matchingAbaTx.trxId})`,
              note: `Verified in Telegram group: Full payment received ($${matchingAbaTx.amountUsd.toFixed(2)}) via ABA Trx ${matchingAbaTx.trxId}`,
            },
          });
          isAutoApproved = true;
        } else {
          // Underpaid: Hold in pending for admin review
          const underpaidNote = `⚠️ Underpaid: Telegram bank alert shows received ${matchingAbaTx.currency === "KHR" ? "៛" : "$"}${matchingAbaTx.amount.toLocaleString()} ($${matchingAbaTx.amountUsd.toFixed(2)}) but subscription plan requires $${amountUsd.toFixed(2)}. Held in PENDING for admin review.`;
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
              verifiedByName: `ABA Partial Payment (${matchingAbaTx.trxId})`,
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
