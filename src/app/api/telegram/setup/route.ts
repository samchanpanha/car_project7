import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { getManualPaymentConfig, resolveTelegramConfig } from "@/lib/api/payments";

export const dynamic = "force-dynamic";

/**
 * Super Admin tool to view and configure Telegram bot webhook.
 */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getManualPaymentConfig();
    const { botToken, chatId } = resolveTelegramConfig(config);

    if (!botToken) {
      return NextResponse.json({
        configured: false,
        error: "Telegram bot token is not configured (check .env or payment settings)",
      });
    }

    // Fetch bot info
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meJson = await meRes.json();

    // Fetch webhook info
    const webhookRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const webhookJson = await webhookRes.json();

    // Fetch chat info if chat ID configured
    let chatJson: Record<string, unknown> | null = null;
    if (chatId) {
      const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      });
      chatJson = await chatRes.json();
    }

    return NextResponse.json({
      configured: true,
      bot: meJson.result ?? meJson,
      webhook: webhookJson.result ?? webhookJson,
      chat: chatJson?.result ?? chatJson,
      chatIdConfigured: chatId,
    });
  } catch (err) {
    return toErrorResponse(err, "api/telegram/setup GET", "Failed to retrieve Telegram status");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const config = await getManualPaymentConfig();
    const { botToken } = resolveTelegramConfig(config);

    if (!botToken) {
      return NextResponse.json(
        { error: "Telegram bot token not configured" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      webhookUrl?: string;
      deleteWebhook?: boolean;
    };

    if (body.deleteWebhook) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`);
      const json = await res.json();
      return NextResponse.json({ success: true, result: json });
    }

    if (!body.webhookUrl) {
      return NextResponse.json({ error: "webhookUrl is required" }, { status: 400 });
    }

    // Set webhook with secret token
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const params: Record<string, unknown> = {
      url: body.webhookUrl,
      allowed_updates: ["callback_query", "message"],
    };
    if (secret) {
      params.secret_token = secret;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();

    return NextResponse.json({ success: true, result: json });
  } catch (err) {
    return toErrorResponse(err, "api/telegram/setup POST", "Failed to update Telegram webhook");
  }
}
