import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseMetaJson, requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { normalizedMonthlyPrice } from "@/lib/api/plans";
import type { AdminOverviewDTO, AuditEntryDTO } from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALL_STATUSES: VehicleStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "SOLD",
  "ARCHIVED",
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    await requireAdmin();
    const now = Date.now();

    const [
      users,
      tenants,
      reportsGenerated,
      conversations,
      favorites,
      appointments,
      activeSubs,
      statusGroups,
      userCreatedAts,
      vehicleCreatedAts,
      tenantsWithVehicles,
      latestLogs,
    ] = await Promise.all([
      db.user.count(),
      db.tenant.count(),
      db.vehicleHistoryReport.count(),
      db.conversation.count(),
      db.favorite.count(),
      db.appointment.count(),
      db.subscription.findMany({
        where: { status: "ACTIVE" },
        select: { priceUsd: true, billingCycle: true },
      }),
      db.vehicle.groupBy({ by: ["status"], _count: { _all: true } }),
      db.user.findMany({ select: { createdAt: true } }),
      db.vehicle.findMany({ select: { createdAt: true } }),
      db.tenant.findMany({
        include: {
          vehicles: { select: { views: true } },
          subscription: { select: { plan: true } },
        },
      }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

    const listingsPublished = statusGroups.find((g) => g.status === "PUBLISHED")?._count._all ?? 0;
    const listingsPending =
      statusGroups.find((g) => g.status === "PENDING_REVIEW")?._count._all ?? 0;

    const mrrUsd = Math.round(
      activeSubs.reduce(
        (sum, s) => sum + normalizedMonthlyPrice(s.priceUsd, s.billingCycle),
        0,
      ),
    );

    const listingsByStatus = Object.fromEntries(
      ALL_STATUSES.map((s) => [
        s,
        statusGroups.find((g) => g.status === s)?._count._all ?? 0,
      ]),
    ) as Record<VehicleStatus, number>;

    // Last 6 ISO-week buckets, oldest → newest (W-5 … W0 = current week).
    const signupTrend: AdminOverviewDTO["signupTrend"] = [];
    for (let w = 5; w >= 0; w--) {
      const start = new Date(now - (w + 1) * WEEK_MS);
      const end = new Date(now - w * WEEK_MS);
      signupTrend.push({
        label: w === 0 ? "W0" : `W-${w}`,
        users: userCreatedAts.filter((u) => u.createdAt >= start && u.createdAt < end).length,
        listings: vehicleCreatedAts.filter((v) => v.createdAt >= start && v.createdAt < end)
          .length,
      });
    }

    const topTenants = tenantsWithVehicles
      .map((t) => ({
        id: t.id,
        name: t.name,
        plan: t.subscription?.plan ?? "FREE",
        listings: t.vehicles.length,
        views: t.vehicles.reduce((sum, v) => sum + v.views, 0),
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 3);

    const actorIds = [
      ...new Set(latestLogs.map((l) => l.actorId).filter((x): x is string => !!x)),
    ];
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorNames = new Map(actors.map((a) => [a.id, a.name]));

    const recentAudit: AuditEntryDTO[] = latestLogs.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      actorName: l.actorId ? (actorNames.get(l.actorId) ?? null) : null,
      createdAt: l.createdAt.toISOString(),
      meta: parseMetaJson(l.metaJson),
    }));

    const dto: AdminOverviewDTO = {
      kpis: {
        users,
        tenants,
        listingsPublished,
        listingsPending,
        reportsGenerated,
        conversations,
        favorites,
        appointments,
        mrrUsd,
      },
      listingsByStatus,
      signupTrend,
      topTenants,
      recentAudit,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/admin/overview GET", "Failed to load admin overview");
  }
}
