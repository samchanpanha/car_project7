import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";
import { ALLOWED_VEHICLE_STATUSES } from "@/lib/api/vehicle-filters";
import type { TenantVehicleRowDTO } from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { tenant } = await requireTenantMember();
    const sp = new URL(req.url).searchParams;

    const statusParam = sp.get("status") || undefined;
    const status =
      statusParam && (ALLOWED_VEHICLE_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as VehicleStatus)
        : undefined;

    // All tenant vehicles in any status (inventory manager view).
    const rows = await db.vehicle.findMany({
      where: { tenantId: tenant.id, ...(status ? { status } : {}) },
      include: vehicleCardInclude,
      orderBy: { createdAt: "desc" },
    });

    const items: TenantVehicleRowDTO[] = rows.slice(0, 100).map(toCardDTO);
    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/inventory GET", "Failed to load tenant inventory");
  }
}
