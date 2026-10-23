import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getManualPaymentConfig,
  resolveTelegramConfig,
  verifyPaymentAndActivate,
  rejectPayment,
} from "@/lib/api/payments";
import {
  answerTelegramCallbackQuery,
  updateTelegramMessageResolution,
  notifySellerPaymentResult,
} from "@/lib/api/telegram-notify";
import { isAbaPayWayMessage, parseAbaPayWayMessage } from "@/lib/api/aba-parser";
import { recordAbaTransaction, syncTelegramGroupUpdates, processTelegramCallbackQuery, handleTelegramGroupCommand } from "@/lib/api/aba-sync";

export const dynamic = "force-dynamic";

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot?: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number | string;
      title?: string;
      type: string;
    };
    caption?: string;
    text?: string;
  };
  data?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number | string;
    type: string;
  };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
}

export async function POST(req: Request) {
  try {
    // 1. Verify webhook secret token if configured
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (expectedSecret && receivedSecret && receivedSecret !== expectedSecret) {
      console.warn("[Telegram Webhook] Invalid secret token received");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await getManualPaymentConfig();
    const { botToken } = resolveTelegramConfig(config);
    if (!botToken) {
      return NextResponse.json({ error: "Telegram bot not configured" }, { status: 500 });
    }

    let update: TelegramUpdate;
    try {
      update = (await req.json()) as TelegramUpdate;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 2. Handle callback queries (Inline keyboard button clicks)
    if (update.callback_query) {
      await processTelegramCallbackQuery(update.callback_query as any, botToken);
      return NextResponse.json({ ok: true });
    }

    // 3. Handle group messages (ABA PayWay payment notifications, text commands & replies)
    const msg = update.message;
    if (msg) {
      const text = (msg.text || "").trim();
      const chatId = msg.chat.id;
      const messageId = msg.message_id;

      // Check if this is an ABA PayWay / KHQR payment alert
      if (text && isAbaPayWayMessage(text)) {
        console.log(`[Telegram Webhook] Incoming ABA PayWay alert in chat ${chatId}`);
        const parsed = parseAbaPayWayMessage(text);
        if (parsed) {
          const syncRes = await recordAbaTransaction(parsed, {
            messageId,
            chatId: String(chatId),
            botToken,
          });
          console.log(`[Telegram Webhook] Synced ABA Trx ${parsed.trxId}:`, {
            matched: syncRes.matched,
            paymentId: syncRes.paymentId,
          });
        }
        return NextResponse.json({ ok: true, abaSynced: true });
      }

      // Handle commands (/pending, /approve, /reject, /status, /sync, /help) and replies
      const handled = await handleTelegramGroupCommand(msg, botToken);
      if (handled) {
        return NextResponse.json({ ok: true, commandHandled: true });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    // Return 200 to Telegram so it doesn't repeatedly retry failing requests
    return NextResponse.json({ ok: true, handledError: true });
  }
}
