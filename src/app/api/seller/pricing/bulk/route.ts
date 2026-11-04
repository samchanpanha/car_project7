import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";
import { z } from "zod";

const sellerBulkPricingSchema = z.object({
  vehicleIds: z.array(z.string()).min(1),
  priceTypeId: z.string().min(1),
  value: z.number().positive(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const parsed = sellerBulkPricingSchema.parse(body);

    const priceType = await db.priceType.findUnique({
      where: { id: parsed.priceTypeId },
    });
    if (!priceType || !priceType.active) {
      return NextResponse.json({ error: "Price type not found or inactive" }, { status: 404 });
    }

    const startDate = parsed.startDate ? new Date(parsed.startDate) : null;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : null;

    // Fetch user's active tenant memberships
    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);

    // Fetch candidate vehicles that the user is authorized to edit
    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
    const whereAuth = isPlatformAdmin
      ? { id: { in: parsed.vehicleIds } }
      : {
          id: { in: parsed.vehicleIds },
          OR: [
            { sellerId: user.id },
            { createdById: user.id },
            ...(writeTenantIds.length > 0 ? [{ tenantId: { in: writeTenantIds } }] : []),
          ],
        };

    const vehicles = await db.vehicle.findMany({
      where: whereAuth,
    });

    if (vehicles.length === 0) {
      return NextResponse.json({
        error: "No authorized listings found for the specified IDs",
      }, { status: 403 });
    }

    const results: Array<{
      vehicleId: string;
      make: string;
      model: string;
      basePriceUsd: number;
      effectivePriceUsd: number;
      floorEnforced: boolean;
    }> = [];

    let floorEnforcedCount = 0;

    for (const v of vehicles) {
      const itemPrice = await db.itemPrice.create({
        data: {
          vehicleId: v.id,
          priceTypeId: priceType.id,
          value: parsed.value,
          currency: "USD",
          startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
          endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
          active: true,
        },
      });

      const effective = resolveEffectivePrice({
        id: v.id,
        priceUsd: v.priceUsd,
        floorPriceUsd: v.floorPriceUsd,
        itemPrices: [{ ...itemPrice, priceType }],
      });

      if (effective.floorEnforced) {
        floorEnforcedCount += 1;
      }

      results.push({
        vehicleId: v.id,
        make: v.make,
        model: v.model,
        basePriceUsd: v.priceUsd,
        effectivePriceUsd: effective.effectivePriceUsd,
        floorEnforced: effective.floorEnforced,
      });
    }

    return NextResponse.json({
      success: true,
      updatedCount: results.length,
      floorEnforcedCount,
      results,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid bulk pricing payload", issues: err.issues }, { status: 400 });
    }
    return toErrorResponse(err, "POST /api/seller/pricing/bulk", "Failed to apply bulk pricing");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const { vehicleIds } = body;

    if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return NextResponse.json({ error: "vehicleIds array is required" }, { status: 400 });
    }

    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);

    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
    const whereAuth = isPlatformAdmin
      ? { id: { in: vehicleIds } }
      : {
          id: { in: vehicleIds },
          OR: [
            { sellerId: user.id },
            { createdById: user.id },
            ...(writeTenantIds.length > 0 ? [{ tenantId: { in: writeTenantIds } }] : []),
          ],
        };

    const vehicles = await db.vehicle.findMany({
      where: whereAuth,
      select: { id: true },
    });

    const authorizedIds = vehicles.map((v) => v.id);
    if (authorizedIds.length === 0) {
      return NextResponse.json({ error: "No authorized listings found" }, { status: 403 });
    }

    const deleteRes = await db.itemPrice.deleteMany({
      where: { vehicleId: { in: authorizedIds } },
    });

    return NextResponse.json({
      success: true,
      removedCount: deleteRes.count,
      vehicleCount: authorizedIds.length,
    });
  } catch (err) {
    return toErrorResponse(err, "DELETE /api/seller/pricing/bulk", "Failed to clear promotions");
  }
}
