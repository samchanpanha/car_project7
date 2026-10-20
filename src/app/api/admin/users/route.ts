import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import type { AdminUserDTO, UserRole } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const [users, listingGroups, favoriteGroups] = await Promise.all([
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          tenantMemberships: {
            include: { tenant: { select: { name: true } } },
            take: 1,
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      db.vehicle.groupBy({ by: ["sellerId"], _count: { _all: true } }),
      db.favorite.groupBy({ by: ["userId"], _count: { _all: true } }),
    ]);

    const listingsBySeller = new Map(listingGroups.map((g) => [g.sellerId, g._count._all]));
    const favoritesByUser = new Map(favoriteGroups.map((g) => [g.userId, g._count._all]));

    const rows: AdminUserDTO[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role as UserRole,
      locale: u.locale,
      phoneVerified: u.phoneVerified,
      createdAt: u.createdAt.toISOString(),
      listingCount: listingsBySeller.get(u.id) ?? 0,
      favoriteCount: favoritesByUser.get(u.id) ?? 0,
      tenantName: u.tenantMemberships[0]?.tenant.name ?? null,
    }));

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(err, "api/admin/users GET", "Failed to load admin users");
  }
}
