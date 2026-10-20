import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canManageTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";
import { PLAN_BY_KEY, toSubscriptionDTO } from "@/lib/api/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();

    const subscription = await db.subscription.findUnique({
      where: { tenantId: tenant.id },
    });

    return NextResponse.json({
      subscription: subscription ? toSubscriptionDTO(subscription) : null,
      plans: Object.values(PLAN_BY_KEY),
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/subscription GET", "Failed to load subscription");
  }
}

const subscribeSchema = z.object({
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
});

export async function POST(req: Request) {
  try {
    const { member, tenant } = await requireTenantMember();
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

    const { plan, billingCycle } = parsed.data;
    const planRow = PLAN_BY_KEY[plan];
    const priceUsd =
      billingCycle === "YEARLY" ? planRow.priceUsdYearly : planRow.priceUsdMonthly;

    const now = new Date();
    const currentPeriodEnd = new Date(now);
    if (billingCycle === "YEARLY") {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const subscription = await db.subscription.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        plan,
        status: "ACTIVE",
        billingCycle,
        priceUsd,
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        startedAt: now,
        currentPeriodEnd,
      },
      update: {
        plan,
        status: "ACTIVE",
        billingCycle,
        priceUsd,
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        startedAt: now,
        currentPeriodEnd,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: member.userId,
        action: "SUBSCRIPTION_CHANGED",
        entity: "Subscription",
        entityId: subscription.id,
        metaJson: JSON.stringify({ plan, billingCycle, priceUsd }),
      },
    });

    return NextResponse.json({ subscription: toSubscriptionDTO(subscription) });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/subscription POST", "Failed to change subscription");
  }
}
