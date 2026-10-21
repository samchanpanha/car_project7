import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { getManualPaymentConfig } from "@/lib/api/payments";
import { sendTelegramMessage } from "@/lib/api/telegram-notify";

export const dynamic = "force-dynamic";

/**
 * Fire a test message through the configured Telegram bot so the Super Admin
 * can confirm token + chat id before the first real payment arrives.
 */
export async function POST() {
  try {
    await requireAdmin();
    const config = await getManualPaymentConfig();
    if (!config.telegramBotToken || !config.telegramChatId) {
      return NextResponse.json(
        { ok: false, error: "Set both the bot token and the chat id first" },
        { status: 400 },
      );
    }
    const delivery = await sendTelegramMessage(
      { telegramBotToken: config.telegramBotToken, telegramChatId: config.telegramChatId },
      "✅ KhLan test message — subscription payment requests (with screenshots) will arrive here.",
    );
    return NextResponse.json({ ok: delivery.sent, error: delivery.error });
  } catch (err) {
    return toErrorResponse(err, "api/admin/payment-config/test-telegram POST", "Telegram test failed");
  }
}
