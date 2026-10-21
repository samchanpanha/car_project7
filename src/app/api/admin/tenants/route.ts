import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { normalizedMonthlyPrice } from "@/lib/api/plans";
import type { AdminTenantDTO, PlanDTO, SubscriptionDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const tenants = await db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, vehicles: true } },
        subscription: true,
      },
    });

    const rows: AdminTenantDTO[] = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      city: t.city,
      verification: t.verification as AdminTenantDTO["verification"],
      status: t.status as AdminTenantDTO["status"],
      memberCount: t._count.members,
      listingCount: t._count.vehicles,
      plan: (t.subscription?.plan ?? null) as PlanDTO["plan"] | null,
      subscriptionStatus: (t.subscription?.status ?? null) as SubscriptionDTO["status"] | null,
      mrrUsd: t.subscription
        ? Math.round(normalizedMonthlyPrice(t.subscription.priceUsd, t.subscription.billingCycle))
        : 0,
      createdAt: t.createdAt.toISOString(),
    }));

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(err, "api/admin/tenants GET", "Failed to load tenants");
  }
}
