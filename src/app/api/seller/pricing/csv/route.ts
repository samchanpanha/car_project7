import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";
import { parsePricingCsv } from "@/app/api/pricing/csv-import/route";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const contentType = req.headers.get("content-type") || "";

    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      const body = await req.json();
      csvText = body.csv || "";
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "Empty CSV content" }, { status: 400 });
    }

    const rows = parsePricingCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    // Cache active price types
    const allPriceTypes = await db.priceType.findMany({ where: { active: true } });
    const priceTypeMap = new Map(allPriceTypes.map((pt) => [pt.code.toUpperCase(), pt]));

    // User's write tenants
    const userTenants = await db.tenantMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const writeTenantIds = userTenants
      .filter((tm) => canWriteTenant(tm.role))
      .map((tm) => tm.tenantId);
    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    const processed: any[] = [];
    const errors: Array<{ row: number; identifier: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pt = priceTypeMap.get(row.priceTypeCode.toUpperCase());
      if (!pt) {
        errors.push({ row: i + 2, identifier: row.identifier, error: `Invalid or inactive price type: ${row.priceTypeCode}` });
        continue;
      }

      // Find vehicle by ID, stockNo, or chassisNo
      const vehicle = await db.vehicle.findFirst({
        where: {
          OR: [
            { id: row.identifier },
            { stockNo: row.identifier },
            { chassisNo: row.identifier },
          ],
        },
      });

      if (!vehicle) {
        errors.push({ row: i + 2, identifier: row.identifier, error: `Listing not found for identifier: ${row.identifier}` });
        continue;
      }

      // Ownership authorization check
      const isOwner =
        isPlatformAdmin ||
        vehicle.sellerId === user.id ||
        vehicle.createdById === user.id ||
        (vehicle.tenantId != null && writeTenantIds.includes(vehicle.tenantId));

      if (!isOwner) {
        errors.push({ row: i + 2, identifier: row.identifier, error: `Not authorized to update pricing on this listing` });
        continue;
      }

      const startDate = row.startDate ? new Date(row.startDate) : null;
      const endDate = row.endDate ? new Date(row.endDate) : null;

      const itemPrice = await db.itemPrice.create({
        data: {
          vehicleId: vehicle.id,
          priceTypeId: pt.id,
          value: row.value,
          currency: "USD",
          startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
          endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
          active: true,
        },
      });

      const effective = resolveEffectivePrice({
        id: vehicle.id,
        priceUsd: vehicle.priceUsd,
        floorPriceUsd: vehicle.floorPriceUsd,
        itemPrices: [{ ...itemPrice, priceType: pt }],
      });

      processed.push({
        vehicleId: vehicle.id,
        stockNo: vehicle.stockNo,
        make: vehicle.make,
        model: vehicle.model,
        basePriceUsd: vehicle.priceUsd,
        effectivePriceUsd: effective.effectivePriceUsd,
        floorEnforced: effective.floorEnforced,
        priceTypeCode: pt.code,
      });
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      importedCount: processed.length,
      failedCount: errors.length,
      errors,
      processed,
    });
  } catch (err: any) {
    return toErrorResponse(err, "POST /api/seller/pricing/csv", "Failed to process CSV pricing");
  }
}

