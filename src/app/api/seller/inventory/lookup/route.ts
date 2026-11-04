import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);

    const stockNo = searchParams.get("stockNo")?.trim();
    const chassisNo = searchParams.get("chassisNo")?.trim();
    const partNumber = searchParams.get("partNumber")?.trim();
    const category = searchParams.get("category")?.trim();

    if (!stockNo && !chassisNo && !partNumber) {
      return NextResponse.json({ found: false });
    }

    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);

    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    const scopeOr: any[] = [
      { sellerId: user.id },
      { createdById: user.id },
      ...(writeTenantIds.length > 0 ? [{ tenantId: { in: writeTenantIds } }] : []),
    ];

    const matchOr: any[] = [];
    if (stockNo) matchOr.push({ stockNo: { equals: stockNo, mode: "insensitive" } });
    if (chassisNo) matchOr.push({ chassisNo: { equals: chassisNo, mode: "insensitive" } });
    if (partNumber) matchOr.push({ partNumber: { equals: partNumber, mode: "insensitive" } });

    const conditions: any[] = [
      isPlatformAdmin ? {} : { OR: scopeOr },
      { OR: matchOr },
    ];

    if (category && category !== "ALL") {
      conditions.push({ listingCategory: category });
    }

    const vehicle = await db.vehicle.findFirst({
      where: { AND: conditions },
      select: {
        id: true,
        make: true,
        model: true,
        variant: true,
        year: true,
        stockNo: true,
        stockQuantity: true,
        chassisNo: true,
        partNumber: true,
        priceUsd: true,
        floorPriceUsd: true,
        listingCategory: true,
        status: true,
        images: { take: 1, select: { url: true } },
      },
    });

    if (!vehicle) {
      return NextResponse.json({ found: false });
    }

    let matchType = "STOCK_NO";
    if (partNumber && vehicle.partNumber?.toLowerCase() === partNumber.toLowerCase()) {
      matchType = "PART_NUMBER";
    } else if (chassisNo && vehicle.chassisNo?.toLowerCase() === chassisNo.toLowerCase()) {
      matchType = "CHASSIS_NO";
    }

    return NextResponse.json({
      found: true,
      matchType,
      vehicle: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        variant: vehicle.variant,
        year: vehicle.year,
        stockNo: vehicle.stockNo,
        stockQuantity: (vehicle as any).stockQuantity ?? 1,
        chassisNo: vehicle.chassisNo,
        partNumber: vehicle.partNumber,
        priceUsd: vehicle.priceUsd,
        floorPriceUsd: vehicle.floorPriceUsd,
        listingCategory: vehicle.listingCategory,
        status: vehicle.status,
        imageUrl: vehicle.images[0]?.url || null,
      },
    });
  } catch (err) {
    return toErrorResponse(err, "GET /api/seller/inventory/lookup", "Failed to lookup inventory duplicate");
  }
}

