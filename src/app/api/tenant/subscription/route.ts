import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canManageTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";
import { PLAN_BY_KEY, toSubscriptionDTO } from "@/lib/api/plans";
import { refreshExpiredSubscription } from "@/lib/api/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();

    const raw = await db.subscription.findUnique({
      where: { tenantId: tenant.id },
    });
    // auto-expire overdue subscriptions on read
    const subscription = await refreshExpiredSubscription(raw);

    return NextResponse.json({
      subscription: subscription ? toSubscriptionDTO(subscription) : null,
      plans: Object.values(PLAN_BY_KEY),
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/subscription GET", "Failed to load subscription");
  }
}

const subscribeSchema = z.object({
  plan: z.enum(["FREE", "BASIC", "PRO", "ENTERPRISE"]),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).optional(),
});

/**
 * Paid plans can NO LONGER be activated directly — they require a verified
 * payment (Bakong KHQR or manual admin verification) via
 * POST /api/tenant/payments. Only the FREE downgrade is applied instantly.
 */
export async function POST(req: Request) {
  try {
    const { user, member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = subscribeSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const plan = parsed.data.plan;
    if (plan !== "FREE") {
      return NextResponse.json(
        { error: "Paid plans require a verified payment — submit a subscription payment request first" },
        { status: 402 },
      );
    }

    const planRow = PLAN_BY_KEY.FREE;
    const now = new Date();

    const subscription = await db.subscription.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        plan,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 0,
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        startedAt: now,
        currentPeriodEnd: now,
      },
      update: {
        plan,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 0,
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        currentPeriodEnd: now,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "SUBSCRIPTION_DOWNGRADED",
        entity: "Subscription",
        entityId: subscription.id,
        metaJson: JSON.stringify({ plan: "FREE" }),
      },
    });

    return NextResponse.json({ subscription: toSubscriptionDTO(subscription) });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/subscription POST", "Failed to change subscription");
  }
}
