import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import {
  getPlanPricing,
  savePlanPricing,
  PAID_PLAN_KEYS,
  type PlanPricingConfig,
} from "@/lib/api/plan-config";

export const dynamic = "force-dynamic";

/**
 * Plans & pricing — the Super Admin's single source of truth for what every
 * paid plan costs and includes. Sellers, payment requests and activations
 * all read from this configuration.
 */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ plans: await getPlanPricing() });
  } catch (err) {
    return toErrorResponse(err, "api/admin/plans GET", "Failed to load plan configuration");
  }
}

const priceField = z.coerce.number().min(0).max(99999);
const limitField = z.coerce.number().int().min(0).max(9999);
const seatField = z.coerce.number().int().min(1).max(9999);

const planCfgSchema = z.object({
  priceUsdMonthly: priceField,
  priceUsdYearly: priceField,
  listingsLimit: limitField,
  featuredLimit: limitField,
  seats: seatField,
  enabled: z.boolean(),
});

const putSchema = z.object(
  Object.fromEntries(PAID_PLAN_KEYS.map((k) => [k, planCfgSchema])) as Record<
    (typeof PAID_PLAN_KEYS)[number],
    typeof planCfgSchema
  >,
);

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
    const plans = parsed.data as PlanPricingConfig;
    await savePlanPricing(plans, admin.id);
    return NextResponse.json({ plans });
  } catch (err) {
    return toErrorResponse(err, "api/admin/plans PUT", "Failed to save plan configuration");
  }
}
