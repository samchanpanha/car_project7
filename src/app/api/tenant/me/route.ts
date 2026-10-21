import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { PLAN_CATALOG, toSubscriptionDTO } from "@/lib/api/plans";
import type { TenantDashboardDTO, TenantMemberDTO, TenantRole } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { member, tenant } = await requireTenantMember();

    const [subscription, members, statusGroups, viewAgg, totalLeads, activeFavorites, appointmentsRequested] =
      await Promise.all([
        db.subscription.findUnique({ where: { tenantId: tenant.id } }),
        db.tenantMember.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "asc" },
          include: { user: { select: { id: true, name: true, phone: true } } },
        }),
        db.vehicle.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: { tenantId: tenant.id },
        }),
        db.vehicle.aggregate({
          where: { tenantId: tenant.id },
          _sum: { views: true },
        }),
        db.conversation.count({ where: { vehicle: { tenantId: tenant.id } } }),
        db.favorite.count({ where: { vehicle: { tenantId: tenant.id } } }),
        db.appointment.count({
          where: { vehicle: { tenantId: tenant.id }, status: { not: "CANCELLED" } },
        }),
      ]);

    const countFor = (status: string) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;

    const memberDTOs: TenantMemberDTO[] = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      phone: m.user.phone,
      role: m.role as TenantRole,
      status: m.status as TenantMemberDTO["status"],
      createdAt: m.createdAt.toISOString(),
    }));

    const dto: TenantDashboardDTO = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl ?? null,
        bio: tenant.bio ?? null,
        bioKm: tenant.bioKm ?? null,
        city: tenant.city,
        address: tenant.address ?? null,
        phone: tenant.phone ?? null,
        telegram: tenant.telegram ?? null,
        verification: tenant.verification as TenantDashboardDTO["tenant"]["verification"],
        status: tenant.status as TenantDashboardDTO["tenant"]["status"],
        memberSince: tenant.createdAt.toISOString(),
      },
      myRole: member.role as TenantRole,
      subscription: subscription ? toSubscriptionDTO(subscription) : null,
      members: memberDTOs,
      plans: PLAN_CATALOG,
      stats: {
        published: countFor("PUBLISHED"),
        pending: countFor("PENDING_REVIEW"),
        sold: countFor("SOLD"),
        draft: countFor("DRAFT"),
        totalViews: viewAgg._sum.views ?? 0,
        totalLeads,
        activeFavorites,
        appointmentsRequested,
      },
    };

    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/me GET", "Failed to load tenant dashboard");
  }
}
