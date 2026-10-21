// Telegram delivery for manual subscription payments.
// When the Super Admin configures a bot token + chat id in the payment
// settings, every seller submission (with its screenshot) is pushed straight
// to the admin's Telegram — no more asking sellers to DM a support handle.
//
// Delivery is best-effort by design: a Telegram outage never blocks the
// payment request itself. The outcome (sent/error) is recorded on the
// payment row so the admin still sees everything in the verification queue.

export interface TelegramDelivery {
  sent: boolean;
  error: string | null;
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

async function tgFetch(token: string, method: string, init: RequestInit): Promise<TelegramDelivery> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      ...init,
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (res.ok && json?.ok) return { sent: true, error: null };
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
): Promise<TelegramDelivery> {
  if (!telegramConfigured(cfg)) return { sent: false, error: "not_configured" };
  return tgFetch(cfg.telegramBotToken!, "sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.telegramChatId, text }),
  });
}

/**
 * Push a payment submission to the admin's Telegram: the screenshot as a
 * photo (when present) with all details in the caption, otherwise a text
 * message with the details alone.
 */
export async function sendPaymentProofToTelegram(
  cfg: TelegramBotConfig,
  payment: {
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
    "🔐 KhLan — subscription payment request",
    `Tenant: ${payment.tenantName}`,
    `Plan: ${payment.plan} (${payment.billingCycle})`,
    `Amount: $${payment.amountUsd.toFixed(2)}`,
    `Reference: ${payment.reference}`,
  ];
  if (payment.manualRef) lines.push(`Bank ref: ${payment.manualRef}`);
  if (payment.note) lines.push(`Note: ${payment.note}`);
  lines.push("", "➡️ Verify it in the KhLan admin · Payments tab");
  const caption = lines.join("\n");

  const dataUrl = payment.evidenceImage;
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return sendTelegramMessage(cfg, caption);
  }

  // data URL → Blob for a multipart sendPhoto upload
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return sendTelegramMessage(cfg, caption);
  const [, mime, b64] = match;
  try {
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0) return sendTelegramMessage(cfg, caption);
    const form = new FormData();
    form.set("chat_id", cfg.telegramChatId!);
    form.set("caption", caption);
    form.set("photo", new Blob([new Uint8Array(bytes)], { type: mime }), "payment-proof");
    return await tgFetch(cfg.telegramBotToken!, "sendPhoto", { method: "POST", body: form });
  } catch {
    // malformed image — still deliver the text details
    return sendTelegramMessage(cfg, caption);
  }
}
