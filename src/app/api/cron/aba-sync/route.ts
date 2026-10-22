import { NextResponse } from "next/server";
import { getManualPaymentConfig, resolveTelegramConfig } from "@/lib/api/payments";
import { syncTelegramGroupUpdates } from "@/lib/api/aba-sync";

export const dynamic = "force-dynamic";

/**
 * Continuous cron endpoint for syncing ABA PayWay transactions from the Telegram group.
 * Can be called periodically (e.g. every 1-5 minutes, or hourly) via cron/scheduler.
 * Securable with Authorization: Bearer <CRON_SECRET> if set in .env.
 */
export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const config = await getManualPaymentConfig();
    const { botToken, chatId } = resolveTelegramConfig(config);

    if (!botToken) {
      return NextResponse.json(
        { error: "Telegram bot token not configured" },
        { status: 400 },
      );
    }

    const targetChat = chatId || "-1004489863210";
    const outcome = await syncTelegramGroupUpdates(botToken, targetChat);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      chatId: targetChat,
      outcome,
    });
  } catch (err) {
    console.error("[Cron aba-sync] Error:", err);
    return NextResponse.json({ error: "Failed to run ABA group sync" }, { status: 500 });
  }
}
