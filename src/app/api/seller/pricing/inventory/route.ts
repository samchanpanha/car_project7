import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);

    const category = searchParams.get("category");
    const branchId = searchParams.get("branchId");
    const q = searchParams.get("q");
    const onSaleOnly = searchParams.get("onSaleOnly") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || searchParams.get("limit") || "10", 10) || 10)
    );

    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);

    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    const conditions: any[] = [];

    if (!isPlatformAdmin) {
      conditions.push({
        OR: [
          { sellerId: user.id },
          { createdById: user.id },
          ...(writeTenantIds.length > 0 ? [{ tenantId: { in: writeTenantIds } }] : []),
        ],
      });
    }

    if (category && category !== "ALL") {
      conditions.push({ listingCategory: category });
    }
    if (branchId && branchId !== "ALL") {
      conditions.push({ branchId: branchId });
    }
    if (q && q.trim()) {
      const term = q.trim();
      conditions.push({
        OR: [
          { make: { contains: term, mode: "insensitive" } },
          { model: { contains: term, mode: "insensitive" } },
          { stockNo: { contains: term, mode: "insensitive" } },
          { chassisNo: { contains: term, mode: "insensitive" } },
        ],
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const vehicles = await db.vehicle.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        branch: { select: { id: true, name: true, city: true } },
        itemPrices: {
          include: { priceType: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = vehicles.map((v) => {
      const pricing = resolveEffectivePrice({
        id: v.id,
        priceUsd: v.priceUsd,
        floorPriceUsd: v.floorPriceUsd,
        itemPrices: v.itemPrices,
      });

      return {
        id: v.id,
        listingCategory: v.listingCategory,
        make: v.make,
        model: v.model,
        variant: v.variant,
        year: v.year,
        stockNo: v.stockNo,
        stockQuantity: (v as any).stockQuantity ?? 1,
        chassisNo: v.chassisNo,
        basePriceUsd: pricing.basePriceUsd,
        effectivePriceUsd: pricing.effectivePriceUsd,
        floorPriceUsd: v.floorPriceUsd,
        floorEnforced: pricing.floorEnforced,
        isOnSale: pricing.isOnSale,
        activePriceType: pricing.activePriceType
          ? {
              id: pricing.activePriceType.id,
              code: pricing.activePriceType.code,
              label: pricing.activePriceType.label,
              badgeColor: pricing.activePriceType.badgeColor,
              mode: pricing.activePriceType.mode,
            }
          : null,
        activeItemPrice: pricing.activeItemPrice
          ? {
              id: pricing.activeItemPrice.id,
              value: pricing.activeItemPrice.value,
              startDate: pricing.activeItemPrice.startDate,
              endDate: pricing.activeItemPrice.endDate,
            }
          : null,
        branch: v.branch,
        images: v.images.map((i) => i.url),
        status: v.status,
      };
    });

    const filtered = onSaleOnly ? rows.filter((r) => r.isOnSale) : rows;
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const paginatedVehicles = filtered.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      vehicles: paginatedVehicles,
      totalCount,
      onSaleCount: rows.filter((r) => r.isOnSale).length,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    return toErrorResponse(err, "GET /api/seller/pricing/inventory", "Failed to get dealer pricing inventory");
  }
}
