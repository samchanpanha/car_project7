import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import {
  getManualPaymentConfig,
  rejectPayment,
  resolveTelegramConfig,
  toPaymentErrorResponse,
  verifyPaymentAndActivate,
} from "@/lib/api/payments";
import {
  sendPaymentProofToTelegram,
  updateTelegramMessageResolution,
} from "@/lib/api/telegram-notify";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["verify", "reject", "send_telegram"]),
  reason: z.string().trim().min(3).max(300).optional(),
});

/**
 * Super Admin decision on a payment request.
 * verify → activates/extends the subscription and syncs resolution to Telegram group
 * reject → records rejection reason and syncs resolution to Telegram group
 * send_telegram → pushes payment card with inline [Approve]/[Reject] buttons to Telegram group
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    if (parsed.data.action === "reject" && !parsed.data.reason) {
      return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
    }

    const payment = await db.subscriptionPayment.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const config = await getManualPaymentConfig();
    const { botToken, chatId } = resolveTelegramConfig(config);

    if (parsed.data.action === "send_telegram") {
      if (!botToken || !chatId) {
        return NextResponse.json({ error: "Telegram bot is not configured" }, { status: 400 });
      }

      const delivery = await sendPaymentProofToTelegram(
        { telegramBotToken: botToken, telegramChatId: chatId },
        {
          paymentId: payment.id,
          tenantName: payment.tenant.name,
          plan: payment.plan,
          billingCycle: payment.billingCycle as "MONTHLY" | "YEARLY",
          amountUsd: payment.amountUsd,
          reference: payment.reference,
          manualRef: payment.manualRef,
          note: payment.note,
          evidenceImage: payment.evidenceImage,
        },
      );

      if (delivery.sent) {
        await db.subscriptionPayment.update({
          where: { id: payment.id },
          data: {
            telegramSentAt: new Date(),
            telegramMessageId: delivery.messageId ?? payment.telegramMessageId,
            telegramGroupId: delivery.chatId ?? chatId,
            telegramError: null,
          },
        });
        return NextResponse.json({ ok: true, sent: true, messageId: delivery.messageId });
      }

      return NextResponse.json({ error: delivery.error || "Failed to deliver to Telegram" }, { status: 502 });
    }

    if (parsed.data.action === "verify") {
      const subscription = await verifyPaymentAndActivate(payment, admin.id);

      // Sync status to Telegram group
      if (botToken && payment.telegramGroupId && payment.telegramMessageId) {
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
        const caption = [
          `🔐 KhLan — Subscription Payment Verified`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `🏢 Tenant: ${payment.tenant.name}`,
          `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
          `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
          `🔖 Reference: ${payment.reference}`,
          payment.manualRef ? `🏦 Bank Ref: ${payment.manualRef}` : null,
          "",
          `✅ VERIFIED & ACTIVATED by Platform Admin`,
          `📅 ${timestamp} (Phnom Penh)`,
          `🎉 Subscription is now ACTIVE!`,
        ].filter(Boolean).join("\n");

        await updateTelegramMessageResolution(
          botToken,
          payment.telegramGroupId,
          payment.telegramMessageId,
          caption,
          Boolean(payment.evidenceImage),
          "✅ Approved & Active",
        );
      }

      return NextResponse.json({ ok: true, subscription });
    }

    // Reject payment
    await rejectPayment(payment, admin.id, parsed.data.reason!);

    // Sync rejection status to Telegram group
    if (botToken && payment.telegramGroupId && payment.telegramMessageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const caption = [
        `🔐 KhLan — Subscription Payment Rejected`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Tenant: ${payment.tenant.name}`,
        `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
        `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
        `🔖 Reference: ${payment.reference}`,
        `❌ Reason: ${parsed.data.reason}`,
        "",
        `❌ REJECTED by Platform Admin`,
        `📅 ${timestamp} (Phnom Penh)`,
      ].join("\n");

      await updateTelegramMessageResolution(
        botToken,
        payment.telegramGroupId,
        payment.telegramMessageId,
        caption,
        Boolean(payment.evidenceImage),
        "❌ Rejected",
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toPaymentErrorResponse(err, "api/admin/payments/[id] PATCH");
  }
}
