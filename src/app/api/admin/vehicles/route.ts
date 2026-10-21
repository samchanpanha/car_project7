import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";
import { ALLOWED_VEHICLE_STATUSES } from "@/lib/api/vehicle-filters";
import type { AdminVehicleRowDTO } from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;

    const statusParam = sp.get("status") || undefined;
    const status =
      statusParam && (ALLOWED_VEHICLE_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as VehicleStatus)
        : undefined;
    const q = sp.get("q")?.trim().toLowerCase() || undefined;

    // Any status is visible to admins (incl. REJECTED / ARCHIVED).
    const rows = await db.vehicle.findMany({
      where: status ? { status } : {},
      include: vehicleCardInclude,
      orderBy: { createdAt: "desc" },
    });

    // Case-insensitive q on make/model/variant (SQLite lacks ci contains).
    const filtered = q
      ? rows.filter((v) =>
          `${v.make} ${v.model} ${v.variant ?? ""}`.toLowerCase().includes(q),
        )
      : rows;

    const items: AdminVehicleRowDTO[] = filtered
      .slice(0, 100)
      .map((v) => ({ ...toCardDTO(v), sellerName: v.seller.name }));

    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/admin/vehicles GET", "Failed to load admin vehicles");
  }
}
