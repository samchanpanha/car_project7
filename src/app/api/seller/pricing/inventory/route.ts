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

    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);

    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    const whereAuth = isPlatformAdmin
      ? {}
      : {
          OR: [
            { sellerId: user.id },
            { createdById: user.id },
            ...(writeTenantIds.length > 0 ? [{ tenantId: { in: writeTenantIds } }] : []),
          ],
        };

    const where: any = {
      ...whereAuth,
    };

    if (category && category !== "ALL") {
      where.listingCategory = category;
    }
    if (branchId && branchId !== "ALL") {
      where.branchId = branchId;
    }
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { make: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
        { stockNo: { contains: term, mode: "insensitive" } },
      ];
    }

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

    return NextResponse.json({
      vehicles: filtered,
      totalCount: rows.length,
      onSaleCount: rows.filter((r) => r.isOnSale).length,
    });
  } catch (err) {
    return toErrorResponse(err, "GET /api/seller/pricing/inventory", "Failed to get dealer pricing inventory");
  }
}

