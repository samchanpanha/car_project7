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

    const categoryParam = sp.get("category")?.toUpperCase() || undefined;
    const category =
      categoryParam && ["CAR", "MOTOR", "SPARE_PART"].includes(categoryParam)
        ? categoryParam
        : undefined;

    const branchId = sp.get("branchId") || undefined;
    const q = sp.get("q")?.trim() || undefined;
    const priceMin = sp.get("priceMin") ? Number(sp.get("priceMin")) : undefined;
    const priceMax = sp.get("priceMax") ? Number(sp.get("priceMax")) : undefined;
    const sort = sp.get("sort") || "newest";

    const where: any = {
      tenantId: tenant.id,
      ...(status ? { status } : {}),
      ...(category ? { listingCategory: category } : {}),
      ...(branchId ? { branchId } : {}),
    };

    if (q) {
      where.OR = [
        { make: { contains: q } },
        { model: { contains: q } },
        { vinLast6: { contains: q } },
        { plateNo: { contains: q } },
        { partNumber: { contains: q } },
        { compatibleModels: { contains: q } },
      ];
    }

    if (priceMin !== undefined || priceMax !== undefined) {
      where.priceUsd = {
        ...(priceMin !== undefined ? { gte: priceMin } : {}),
        ...(priceMax !== undefined ? { lte: priceMax } : {}),
      };
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "price_asc") orderBy = { priceUsd: "asc" };
    else if (sort === "price_desc") orderBy = { priceUsd: "desc" };
    else if (sort === "views") orderBy = { views: "desc" };
    else if (sort === "year_desc") orderBy = { year: "desc" };

    const total = await db.vehicle.count({ where });

    const pageParam = sp.get("page");
    const limitParam = sp.get("limit");

    if (pageParam || sp.get("paged") === "true") {
      const page = Math.max(1, parseInt(pageParam || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(limitParam || "20", 10)));
      const skip = (page - 1) * limit;

      const rows = await db.vehicle.findMany({
        where,
        include: vehicleCardInclude,
        orderBy,
        skip,
        take: limit,
      });

      const items: TenantVehicleRowDTO[] = rows.map(toCardDTO);
      const pageCount = Math.max(1, Math.ceil(total / limit));

      return NextResponse.json({
        items,
        total,
        page,
        limit,
        pageCount,
      });
    }

    // Default unpaged behavior (backward compatible, returns array with up to 500 records)
    const rows = await db.vehicle.findMany({
      where,
      include: vehicleCardInclude,
      orderBy,
      take: 500,
    });

    const items: TenantVehicleRowDTO[] = rows.map(toCardDTO);
    return NextResponse.json(items, {
      headers: {
        "x-total-count": String(total),
      },
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/inventory GET", "Failed to load tenant inventory");
  }
}
