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
import { recordAbaTransaction, syncTelegramGroupUpdates, processTelegramCallbackQuery } from "@/lib/api/aba-sync";

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

    // 3. Handle group messages (ABA PayWay payment notifications & text commands)
    const msg = update.message;
    if (msg?.text) {
      const text = msg.text.trim();
      const chatId = msg.chat.id;
      const messageId = msg.message_id;

      // Check if this is an ABA PayWay / KHQR payment alert
      if (isAbaPayWayMessage(text)) {
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

      if (text.startsWith("/sync")) {
        const outcome = await syncTelegramGroupUpdates(botToken, String(chatId));
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔄 Sync Complete:\n• Processed: ${outcome.processed} messages\n• New Transactions: ${outcome.newTransactions}\n• Auto-matched Payments: ${outcome.matchedPayments}`,
          }),
        });
        return NextResponse.json({ ok: true });
      }

      if (text.startsWith("/status")) {
        const parts = text.split(/\s+/);
        const ref = parts[1];
        if (!ref) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "Usage: /status <PAY-REFERENCE>\nExample: /status PAY-20261022-A1B2C3",
            }),
          });
        } else {
          const p = await db.subscriptionPayment.findUnique({
            where: { reference: ref },
            include: { tenant: true },
          });
          if (!p) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: `❌ Payment not found for reference: ${ref}` }),
            });
          } else {
            const reply = [
              `🔍 Payment Status for ${p.reference}`,
              `Tenant: ${p.tenant?.name ?? p.tenantId}`,
              `Plan: ${p.plan} (${p.billingCycle})`,
              `Amount: $${p.amountUsd.toFixed(2)}`,
              `Status: ${p.status}`,
              p.verifiedByName ? `Verified by: ${p.verifiedByName}` : "",
              p.rejectionReason ? `Reason: ${p.rejectionReason}` : "",
              `Created: ${p.createdAt.toISOString()}`,
            ]
              .filter(Boolean)
              .join("\n");

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: reply }),
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    // Return 200 to Telegram so it doesn't repeatedly retry failing requests
    return NextResponse.json({ ok: true, handledError: true });
  }
}
