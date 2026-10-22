// Telegram delivery for manual subscription payments.
// When the Super Admin configures a bot token + chat id (or via .env),
// every seller submission (with its screenshot) is pushed straight
// to the admin's Telegram group with inline [Approve] / [Reject] buttons.
//
// Delivery is best-effort by design: a Telegram outage never blocks the
// payment request itself. The outcome (sent/error, messageId) is recorded on the
// payment row so the admin still sees everything in the verification queue.

export interface TelegramDelivery {
  sent: boolean;
  error: string | null;
  messageId?: number | null;
  chatId?: string | null;
}

/** Minimal structural view of the admin's bot config. */
export interface TelegramBotConfig {
  telegramBotToken: string | null;
  telegramChatId: string | null;
}

const TG_TIMEOUT_MS = 10_000;

/** True when both halves of the bot configuration are present. */
export function telegramConfigured(cfg: TelegramBotConfig): boolean {
  return Boolean(cfg.telegramBotToken && cfg.telegramChatId);
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
    chat?: {
      id?: number | string;
    };
  };
}

async function tgFetch(token: string, method: string, init: RequestInit): Promise<TelegramDelivery> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      ...init,
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as TelegramResponse | null;
    if (res.ok && json?.ok) {
      return {
        sent: true,
        error: null,
        messageId: json.result?.message_id ?? null,
        chatId: json.result?.chat?.id ? String(json.result.chat.id) : null,
      };
    }
    return { sent: false, error: json?.description || `Telegram HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    return { sent: false, error: msg === "TimeoutError" ? "Telegram request timed out" : msg };
  }
}

/** Plain text message to the configured chat. */
export async function sendTelegramMessage(
  cfg: TelegramBotConfig,
  text: string,
  replyMarkup?: object,
): Promise<TelegramDelivery> {
  if (!telegramConfigured(cfg)) return { sent: false, error: "not_configured" };
  return tgFetch(cfg.telegramBotToken!, "sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.telegramChatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

/**
 * Push a payment submission to the admin's Telegram group:
 * Includes screenshot (as photo) or text details, with inline [Approve] and [Reject] buttons.
 */
export async function sendPaymentProofToTelegram(
  cfg: TelegramBotConfig,
  payment: {
    paymentId?: string;
    tenantName: string;
    plan: string;
    billingCycle: "MONTHLY" | "YEARLY";
    amountUsd: number;
    reference: string;
    manualRef?: string | null;
    note?: string | null;
    evidenceImage?: string | null; // data URL
  },
): Promise<TelegramDelivery> {
  if (!telegramConfigured(cfg)) return { sent: false, error: "not_configured" };

  const lines = [
    "🔐 KhLan — Subscription Payment Request",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `🏢 Tenant: ${payment.tenantName}`,
    `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
    `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
    `🔖 Reference: ${payment.reference}`,
  ];
  if (payment.manualRef) lines.push(`🏦 Bank Ref: ${payment.manualRef}`);
  if (payment.note) lines.push(`📝 Note: ${payment.note}`);
  lines.push("", "⚡ Tap below to verify or reject directly from Telegram:");
  const caption = lines.join("\n");

  const replyMarkup = payment.paymentId
    ? {
        inline_keyboard: [
          [
            { text: "✅ Approve & Activate", callback_data: `approve:${payment.paymentId}` },
            { text: "❌ Reject", callback_data: `reject:${payment.paymentId}` },
          ],
        ],
      }
    : undefined;

  const dataUrl = payment.evidenceImage;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return sendTelegramMessage(cfg, caption, replyMarkup);
  }

  // data URL → Blob for a multipart sendPhoto upload
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return sendTelegramMessage(cfg, caption, replyMarkup);
  const [, mime, b64] = match;
  try {
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0) return sendTelegramMessage(cfg, caption, replyMarkup);
    const form = new FormData();
    form.set("chat_id", cfg.telegramChatId!);
    form.set("caption", caption);
    if (replyMarkup) {
      form.set("reply_markup", JSON.stringify(replyMarkup));
    }
    form.set("photo", new Blob([new Uint8Array(bytes)], { type: mime }), "payment-proof.jpg");
    return await tgFetch(cfg.telegramBotToken!, "sendPhoto", { method: "POST", body: form });
  } catch {
    // fallback: deliver text details
    return sendTelegramMessage(cfg, caption, replyMarkup);
  }
}

/**
 * Answer an incoming Telegram callback query (stops the button loading spinner).
 */
export async function answerTelegramCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Update the original Telegram message after approval or rejection:
 * Removes inline buttons and appends resolution badge to caption/text.
 */
export async function updateTelegramMessageResolution(
  token: string,
  chatId: string | number,
  messageId: number,
  updatedTextOrCaption: string,
  isPhoto = true,
  statusBadgeText?: string,
): Promise<boolean> {
  const replyMarkup = statusBadgeText
    ? { inline_keyboard: [[{ text: statusBadgeText, callback_data: "noop" }]] }
    : { inline_keyboard: [] };

  const tryEditCaption = async () => {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: updatedTextOrCaption,
        reply_markup: replyMarkup,
      }),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    return res.ok;
  };

  const tryEditText = async () => {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: updatedTextOrCaption,
        reply_markup: replyMarkup,
      }),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    return res.ok;
  };

  try {
    // 1. Try primary method based on isPhoto
    let ok = isPhoto ? await tryEditCaption() : await tryEditText();

    // 2. If primary failed, try secondary method
    if (!ok) {
      ok = isPhoto ? await tryEditText() : await tryEditCaption();
    }

    // 3. If editing both failed (e.g. message too old or deleted), post a reply to the group
    if (!ok) {
      const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          reply_to_message_id: messageId,
          text: updatedTextOrCaption,
          reply_markup: replyMarkup,
        }),
        signal: AbortSignal.timeout(TG_TIMEOUT_MS),
      });
      return sendRes.ok;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Send notification to seller on payment approval or rejection (if telegram contact is known).
 */
export async function notifySellerPaymentResult(
  token: string,
  sellerChatId: string | number,
  info: {
    plan: string;
    billingCycle: string;
    reference: string;
    status: "VERIFIED" | "REJECTED";
    reason?: string | null;
  },
): Promise<boolean> {
  const isApproved = info.status === "VERIFIED";
  const text = isApproved
    ? `🎉 Subscription Activated!\n\nYour ${info.plan} (${info.billingCycle}) plan is now active.\nReference: ${info.reference}\n\nThank you for choosing KhLan!`
    : `⚠️ Subscription Payment Update\n\nYour payment for ${info.plan} (${info.billingCycle}) could not be verified.\nReference: ${info.reference}\n${info.reason ? `Reason: ${info.reason}\n` : ""}Please contact support or resubmit.`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: sellerChatId, text }),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send subscription expiry reminder to chat.
 */
export async function sendSubscriptionExpiryReminder(
  cfg: TelegramBotConfig,
  info: {
    tenantName: string;
    plan: string;
    daysLeft: number;
    expiryDate: string;
  },
): Promise<TelegramDelivery> {
  const text = [
    "⏰ KhLan — Subscription Expiry Alert",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `🏢 Tenant: ${info.tenantName}`,
    `📋 Plan: ${info.plan}`,
    `⏳ Status: Expiring in ${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"} (${info.expiryDate})`,
    "",
    "Renew now from the KhLan Dealer Dashboard to maintain active listings and features.",
  ].join("\n");

  return sendTelegramMessage(cfg, text);
}
