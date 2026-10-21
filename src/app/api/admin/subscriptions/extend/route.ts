import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { PLAN_BY_KEY, toSubscriptionDTO } from "@/lib/api/plans";
import type { PlanKey } from "@/lib/api/plans";

export const dynamic = "force-dynamic";

const extendSchema = z.object({
  tenantId: z.string().min(1),
  plan: z.enum(["FREE", "BASIC", "PRO", "ENTERPRISE"]).optional(),
  months: z.number().int().min(1).max(36),
  note: z.string().trim().max(300).optional(),
});

/**
 * Manual subscription activation/extension by the Super Admin.
 * Keeps an audit record of who extended what, when and why.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = extendSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { tenantId, months, note } = parsed.data;

    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const existing = await db.subscription.findUnique({ where: { tenantId } });
    const plan = (parsed.data.plan ?? existing?.plan ?? "FREE") as PlanKey;
    const planRow = PLAN_BY_KEY[plan];
    if (!planRow) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    const now = new Date();
    const base =
      existing && existing.status === "ACTIVE" && existing.currentPeriodEnd.getTime() > now.getTime()
        ? new Date(existing.currentPeriodEnd)
        : now;
    const currentPeriodEnd = new Date(base);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + months);

    const subscription = await db.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan,
        status: "ACTIVE",
        billingCycle: months >= 12 ? "YEARLY" : "MONTHLY",
        priceUsd: planRow.priceUsdMonthly,
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        startedAt: now,
        currentPeriodEnd,
      },
      update: {
        plan,
        status: "ACTIVE",
        listingsLimit: planRow.listingsLimit,
        featuredLimit: planRow.featuredLimit,
        seats: planRow.seats,
        currentPeriodEnd,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "SUBSCRIPTION_EXTENDED",
        entity: "Subscription",
        entityId: subscription.id,
        metaJson: JSON.stringify({
          tenantId,
          plan,
          months,
          note: note ?? null,
          extendedFrom: base.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
        }),
      },
    });

    return NextResponse.json({ subscription: toSubscriptionDTO(subscription) });
  } catch (err) {
    return toErrorResponse(err, "api/admin/subscriptions/extend POST", "Failed to extend subscription");
  }
}
