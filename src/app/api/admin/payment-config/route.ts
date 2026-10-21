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

const putSchema = z.object({
  enabled: z.boolean(),
  accountName: z.string().trim().max(80).nullable(),
  khqrPayload: z.string().trim().max(600).nullable(),
  khqrImageUrl: z.string().trim().url().max(500).nullable().or(z.literal("")),
  instructionsEn: z.string().trim().max(600).nullable(),
  instructionsKm: z.string().trim().max(600).nullable(),
  telegram: z.string().trim().max(60).regex(/^@?[A-Za-z0-9_]{4,32}$/, "Telegram username looks invalid").nullable().or(z.literal("")),
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
    instructionsEn: input.instructionsEn || null,
    instructionsKm: input.instructionsKm || null,
    telegram: input.telegram ? (input.telegram.startsWith("@") ? input.telegram : `@${input.telegram}`) : null,
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
