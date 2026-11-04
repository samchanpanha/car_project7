import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const vehicles = await db.vehicle.findMany({
      where: {
        OR: [
          { sellerId: user.id },
          { createdById: user.id },
        ],
      },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        itemPrices: {
          include: { priceType: true },
          where: { active: true },
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
        partCategory: v.partCategory,
        partTarget: v.partTarget,
        partCondition: v.partCondition,
        compatibleModels: v.compatibleModels,
        partNumber: v.partNumber,
        make: v.make,
        model: v.model,
        variant: v.variant,
        year: v.year,
        priceUsd: v.priceUsd,
        basePriceUsd: pricing.basePriceUsd,
        effectivePriceUsd: pricing.effectivePriceUsd,
        isOnSale: pricing.isOnSale,
        activePriceType: pricing.activePriceType
          ? {
              code: pricing.activePriceType.code,
              label: pricing.activePriceType.label,
              badgeColor: pricing.activePriceType.badgeColor,
              mode: pricing.activePriceType.mode,
            }
          : null,
        floorPriceUsd: v.floorPriceUsd,
        floorEnforced: pricing.floorEnforced,
        priceMasked: v.priceMasked,
        mileageKm: v.mileageKm,
        status: v.status,
        featured: v.featured,
        views: v.views,
        createdAt: v.createdAt.toISOString(),
        images: v.images.map((i) => i.url),
      };
    });

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(err, "GET /api/vehicles/mine", "Failed to get user listings");
  }
}

