import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import {
  getManualPaymentConfig,
  saveManualPaymentConfig,
  type ManualPaymentConfig,
} from "@/lib/api/payments";

export const dynamic = "force-dynamic";

/**
 * Manual KHQR payment settings (Super Admin only).
 * The KHQR payload is the admin's own bank-issued KHQR string; sellers see the
 * rendered QR, pay, then send the transaction reference via the configured
 * Telegram contact — the admin verifies and activates the subscription.
 * `enabled` toggles the whole flow; `freePlan` configures the free tier.
 */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getManualPaymentConfig());
  } catch (err) {
    return toErrorResponse(err, "api/admin/payment-config GET", "Failed to load payment config");
  }
}

const limitField = z.coerce.number().int().min(0).max(9999);

/** Image (data URL or uploaded URL) — hard size cap ~1.5 MB */
const imageVal = z
  .string()
  .trim()
  .max(1_600_000, "Image is too large (max ~1.5 MB)")
  .refine(
    (v) =>
      v === "" ||
      /^https?:\/\/.+/.test(v) ||
      /^\/api\/uploads\/.+/.test(v) ||
      /^\/khqr\/.+/.test(v) ||
      /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Must be a valid image URL or base64 data URL"
  )
  .nullable()
  .or(z.literal(""));

const putSchema = z.object({
  enabled: z.boolean(),
  accountName: z.string().trim().max(80).nullable(),
  khqrPayload: z.string().trim().max(600).nullable(),
  khqrImageUrl: z.string().trim().url().max(500).nullable().or(z.literal("")),
  khqrImage: imageVal.optional(),
  khqrImageMonthly: imageVal.optional(),
  khqrImageYearly: imageVal.optional(),
  khqrImageUsd: imageVal.optional(),
  khqrImageKhr: imageVal.optional(),
  khqrImageMonthlyKhr: imageVal.optional(),
  khqrImageYearlyKhr: imageVal.optional(),
  khrExchangeRate: z.coerce.number().min(1000).max(20000).default(4100),
  maxTrxAgeHours: z.coerce.number().min(1).max(720).default(72),
  skipMerchantCheck: z.boolean().default(true),
  instructionsEn: z.string().trim().max(600).nullable(),
  instructionsKm: z.string().trim().max(600).nullable(),
  telegram: z.string().trim().max(60).regex(/^@?[A-Za-z0-9_]{4,32}$/, "Telegram username looks invalid").nullable().or(z.literal("")),
  telegramBotToken: z.string().trim().max(120).regex(/^[0-9A-Za-z:_-]*$/, "Bot token looks invalid").nullable().or(z.literal("")),
  telegramChatId: z.string().trim().max(60).regex(/^-?[0-9A-Za-z_@]*$/, "Chat id looks invalid").nullable().or(z.literal("")),
  freePlan: z.object({
    enabled: z.boolean(),
    listingsLimit: limitField,
    featuredLimit: limitField,
    seats: limitField.refine((n) => n >= 1, "At least 1 seat"),
  }),
});

function clean(input: z.infer<typeof putSchema>): ManualPaymentConfig {
  return {
    enabled: input.enabled,
    accountName: input.accountName || null,
    khqrPayload: input.khqrPayload || null,
    khqrImageUrl: input.khqrImageUrl || null,
    khqrImage: input.khqrImage || null,
    khqrImageMonthly: input.khqrImageMonthly || null,
    khqrImageYearly: input.khqrImageYearly || null,
    khqrImageUsd: input.khqrImageUsd || null,
    khqrImageKhr: input.khqrImageKhr || null,
    khqrImageMonthlyKhr: input.khqrImageMonthlyKhr || null,
    khqrImageYearlyKhr: input.khqrImageYearlyKhr || null,
    khrExchangeRate: input.khrExchangeRate || 4100,
    maxTrxAgeHours: input.maxTrxAgeHours || 72,
    skipMerchantCheck: typeof input.skipMerchantCheck === "boolean" ? input.skipMerchantCheck : true,
    instructionsEn: input.instructionsEn || null,
    instructionsKm: input.instructionsKm || null,
    telegram: input.telegram ? (input.telegram.startsWith("@") ? input.telegram : `@${input.telegram}`) : null,
    telegramBotToken: input.telegramBotToken || null,
    telegramChatId: input.telegramChatId || null,
    freePlan: input.freePlan,
  };
}

export async function PUT(req: Request) {
  try {
    const admin = await requireAdmin();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const saved = await saveManualPaymentConfig(clean(parsed.data), admin.id);
    return NextResponse.json(saved);
  } catch (err) {
    return toErrorResponse(err, "api/admin/payment-config PUT", "Failed to save payment config");
  }
}
