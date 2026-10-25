// Subscription payment engine — plan pricing, payment references,
// expiry refresh, and the single guarded path that turns a VERIFIED payment
// into an activated/extended subscription. Payment status and subscription
// status are separate fields and only meet inside this module.

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getPlanPricing, priceForCfg, type PaidPlanKey } from "@/lib/api/plan-config";
import { toSubscriptionDTO } from "@/lib/api/plans";
import type { SubscriptionDTO } from "@/lib/dashboard-types";
import type { Subscription, SubscriptionPayment } from "@prisma/client";

// ---------- Manual KHQR configuration (Super Admin settings) ----------

export interface FreePlanConfig {
  enabled: boolean; // when false, sellers cannot use/downgrade to the FREE plan
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
}

export interface ManualPaymentConfig {
  /** master switch — when false sellers cannot submit new subscription payments */
  enabled: boolean;
  accountName: string | null;
  khqrPayload: string | null; // EMVCo KHQR string from the admin's banking app
  khqrImageUrl: string | null; // fallback: URL of a QR image
  /** uploaded QR image (data URL) — what sellers actually scan, takes display precedence */
  khqrImage: string | null;
  /** Per-cycle KHQR images — allows showing different QR codes for monthly vs yearly */
  khqrImageMonthly: string | null; // data URL or public path for monthly plan QR
  khqrImageYearly: string | null;  // data URL or public path for yearly plan QR
  /** Per-currency KHQR images — dedicated QR codes for USD vs KHR payments */
  khqrImageUsd: string | null;     // data URL or public path for USD KHQR
  khqrImageKhr: string | null;     // data URL or public path for KHR KHQR
  /** Dedicated 2x2 cycle-currency QR codes */
  khqrImageMonthlyKhr: string | null; // data URL or public path for Monthly KHR QR
  khqrImageYearlyKhr: string | null;  // data URL or public path for Yearly KHR QR
  /** KHR exchange rate per USD (default 4100) */
  khrExchangeRate: number;
  /** Maximum transaction age in hours allowed for reuse prevention (default 72h = 3 days) */
  maxTrxAgeHours: number;
  /** When true, skip merchant payee stop check so payments are not blocked by payee parsing */
  skipMerchantCheck: boolean;
  instructionsEn: string | null;
  instructionsKm: string | null;
  telegram: string | null; // admin Telegram contact, e.g. "@khlan_admin" (shown to sellers)
  /** Telegram bot delivery — submissions (with screenshots) are pushed to this chat */
  telegramBotToken: string | null;
  telegramChatId: string | null;
  freePlan: FreePlanConfig; // admin-configured FREE tier usage
}

const CONFIG_KEY = "payments.manualConfig";

const DEFAULT_CONFIG: ManualPaymentConfig = {
  enabled: true,
  accountName: null,
  khqrPayload: null,
  khqrImageUrl: null,
  khqrImage: null,
  khqrImageMonthly: null,
  khqrImageYearly: null,
  khqrImageUsd: null,
  khqrImageKhr: null,
  khqrImageMonthlyKhr: null,
  khqrImageYearlyKhr: null,
  khrExchangeRate: 4100,
  maxTrxAgeHours: 72,
  skipMerchantCheck: true,
  instructionsEn: null,
  instructionsKm: null,
  telegram: null,
  telegramBotToken: null,
  telegramChatId: null,
  freePlan: { enabled: true, listingsLimit: 3, featuredLimit: 0, seats: 1 },
};

/**
 * Resolve Telegram bot token and chat ID — .env values take precedence,
 * then fall back to whatever the admin stored in PlatformSettings.
 */
export function resolveTelegramConfig(config: ManualPaymentConfig): {
  botToken: string | null;
  chatId: string | null;
} {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || config.telegramBotToken || null,
    chatId: process.env.TELEGRAM_GROUP_CHAT_ID || config.telegramChatId || null,
  };
}

function clampLimit(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.min(9999, Math.max(0, v));
}

export async function getManualPaymentConfig(): Promise<ManualPaymentConfig> {
  const row = await db.platformSetting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return { ...DEFAULT_CONFIG, freePlan: { ...DEFAULT_CONFIG.freePlan } };
  try {
    const parsed = JSON.parse(row.valueJson) as Partial<ManualPaymentConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      skipMerchantCheck: typeof parsed.skipMerchantCheck === "boolean" ? parsed.skipMerchantCheck : true,
      freePlan: {
        ...DEFAULT_CONFIG.freePlan,
        ...(parsed.freePlan ?? {}),
        listingsLimit: clampLimit(parsed.freePlan?.listingsLimit, DEFAULT_CONFIG.freePlan.listingsLimit),
        featuredLimit: clampLimit(parsed.freePlan?.featuredLimit, DEFAULT_CONFIG.freePlan.featuredLimit),
        seats: clampLimit(parsed.freePlan?.seats, DEFAULT_CONFIG.freePlan.seats) || 1,
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG, freePlan: { ...DEFAULT_CONFIG.freePlan } };
  }
}

export async function saveManualPaymentConfig(
  config: ManualPaymentConfig,
  actorId: string,
): Promise<ManualPaymentConfig> {
  const valueJson = JSON.stringify(config);
  await db.platformSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, valueJson },
    update: { valueJson },
  });
  // keep every FREE subscription in sync with the configured free-tier limits
  await db.subscription.updateMany({
    where: { plan: "FREE" },
    data: {
      listingsLimit: config.freePlan.listingsLimit,
      featuredLimit: config.freePlan.featuredLimit,
      seats: config.freePlan.seats,
    },
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "PAYMENT_CONFIG_UPDATED",
      entity: "PlatformSetting",
      entityId: CONFIG_KEY,
      metaJson: JSON.stringify({
        enabled: config.enabled,
        telegram: config.telegram,
        hasKhqrPayload: Boolean(config.khqrPayload),
        hasKhqrImage: Boolean(config.khqrImage || config.khqrImageUrl),
        hasTelegramBot: Boolean(config.telegramBotToken && config.telegramChatId),
        freePlan: config.freePlan,
      }),
    },
  });
  return config;
}

/** Render the configured KHQR payload as a PNG data URL (server-side only). */
export async function khqrDataUrl(config: ManualPaymentConfig): Promise<string | null> {
  if (!config.khqrPayload) return null;
  try {
    return await QRCode.toDataURL(config.khqrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
  } catch {
    return null;
  }
}

// ---------- Pricing & references ----------

export function monthsForCycle(billingCycle: "MONTHLY" | "YEARLY"): number {
  return billingCycle === "YEARLY" ? 12 : 1;
}

export function generatePaymentReference(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PAY-${ymd}-${rand}`;
}

// ---------- Expiry ----------

/**
 * Flip an overdue ACTIVE subscription to EXPIRED (idempotent).
 * Called by tenant-facing subscription readers so restrictions apply
 * automatically without a cron worker. Listings are retained.
 */
export async function refreshExpiredSubscription(
  subscription: Subscription | null,
): Promise<Subscription | null> {
  if (!subscription) return subscription;
  if (
    subscription.status === "ACTIVE" &&
    subscription.currentPeriodEnd.getTime() < Date.now()
  ) {
    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    });
    await db.auditLog.create({
      data: {
        action: "SUBSCRIPTION_EXPIRED",
        entity: "Subscription",
        entityId: subscription.id,
        metaJson: JSON.stringify({ tenantId: subscription.tenantId, plan: subscription.plan }),
      },
    });
    return updated;
  }
  return subscription;
}

// ---------- Activation (the only place a payment unlocks a subscription) ----------

/**
 * Mark a payment VERIFIED and activate/extend the tenant subscription.
 * Rules:
 *  - duplicate verification is rejected (409 conflict semantics via HttpError-like Error)
 *  - extension base = max(now, currentPeriodEnd) so renewals never lose paid days
 */
export async function verifyPaymentAndActivate(
  payment: SubscriptionPayment,
  actorId: string,
): Promise<SubscriptionDTO> {
  if (payment.status === "VERIFIED") {
    throw paymentConflict("This payment has already been verified");
  }
  if (payment.status === "CANCELLED" || payment.status === "REJECTED") {
    throw paymentConflict(`This payment is ${payment.status.toLowerCase()} and cannot be verified`);
  }

  // numbers come from the admin-configured plan catalog, not code constants
  const pricing = await getPlanPricing();
  const cfg = pricing[payment.plan as PaidPlanKey];
  if (!cfg) throw paymentConflict("Unknown plan on payment record");

  const now = new Date();
  const existing = await db.subscription.findUnique({ where: { tenantId: payment.tenantId } });

  // extension base: now, or the current period end when still valid
  const base =
    existing && existing.status === "ACTIVE" && existing.currentPeriodEnd.getTime() > now.getTime()
      ? new Date(existing.currentPeriodEnd)
      : now;
  const currentPeriodEnd = new Date(base);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + payment.months);

  const cycle = payment.billingCycle === "YEARLY" ? (("YEARLY") as const) : (("MONTHLY") as const);
  const data = {
    plan: payment.plan,
    status: "ACTIVE" as const,
    billingCycle: cycle,
    priceUsd: priceForCfg(cfg, cycle),
    listingsLimit: cfg.listingsLimit,
    featuredLimit: cfg.featuredLimit,
    seats: cfg.seats,
    currentPeriodEnd,
  };

  const [subscription, updatedPayment] = await db.$transaction([
    existing
      ? db.subscription.update({ where: { id: existing.id }, data })
      : db.subscription.create({
          data: { tenantId: payment.tenantId, startedAt: now, ...data },
        }),
    db.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "VERIFIED",
        reviewedById: actorId,
        reviewedAt: now,
      },
    }),
  ]);

  await db.auditLog.create({
    data: {
      actorId,
      action: "PAYMENT_VERIFIED",
      entity: "SubscriptionPayment",
      entityId: payment.id,
      metaJson: JSON.stringify({
        reference: payment.reference,
        method: payment.method,
        plan: payment.plan,
        amountUsd: payment.amountUsd,
        tenantId: payment.tenantId,
        subscriptionId: subscription.id,
        activated: !existing || existing.status !== "ACTIVE",
        extendedFrom: base.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      }),
    },
  });

  void updatedPayment;
  return toSubscriptionDTO(subscription);
}

export async function rejectPayment(
  payment: SubscriptionPayment,
  actorId: string,
  reason: string,
): Promise<void> {
  if (payment.status === "VERIFIED") {
    throw paymentConflict("A verified payment cannot be rejected");
  }
  if (payment.status === "REJECTED") return; // idempotent
  await db.subscriptionPayment.update({
    where: { id: payment.id },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
      reviewedById: actorId,
      reviewedAt: new Date(),
    },
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: "PAYMENT_REJECTED",
      entity: "SubscriptionPayment",
      entityId: payment.id,
      metaJson: JSON.stringify({
        reference: payment.reference,
        reason,
        tenantId: payment.tenantId,
      }),
    },
  });
}

function paymentConflict(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = 409;
  return err;
}

/** Consistent error → response mapping for payment routes. */
export function toPaymentErrorResponse(err: unknown, tag: string): NextResponse {
  const e = err as Error & { status?: number };
  if (e?.status && e.status !== 500) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${tag}] failed:`, err);
  return NextResponse.json({ error: "Payment operation failed" }, { status: 500 });
}
