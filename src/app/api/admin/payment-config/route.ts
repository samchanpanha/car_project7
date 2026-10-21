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
 * Official Bakong KHQR + manual payment settings (Super Admin only).
 * The KHQR payload is the admin's own bank-issued KHQR string; secrets stay
 * in env (BAKONG_TOKEN) — nothing sensitive is ever accepted or returned here.
 */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getManualPaymentConfig());
  } catch (err) {
    return toErrorResponse(err, "api/admin/payment-config GET", "Failed to load payment config");
  }
}

const putSchema = z.object({
  accountName: z.string().trim().max(80).nullable(),
  khqrPayload: z.string().trim().max(600).nullable(),
  khqrImageUrl: z.string().trim().url().max(500).nullable().or(z.literal("")),
  instructionsEn: z.string().trim().max(600).nullable(),
  instructionsKm: z.string().trim().max(600).nullable(),
  telegram: z.string().trim().max(60).regex(/^@?[A-Za-z0-9_]{4,32}$/, "Telegram username looks invalid").nullable().or(z.literal("")),
});

function clean(input: z.infer<typeof putSchema>): ManualPaymentConfig {
  return {
    accountName: input.accountName || null,
    khqrPayload: input.khqrPayload || null,
    khqrImageUrl: input.khqrImageUrl || null,
    instructionsEn: input.instructionsEn || null,
    instructionsKm: input.instructionsKm || null,
    telegram: input.telegram ? (input.telegram.startsWith("@") ? input.telegram : `@${input.telegram}`) : null,
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
