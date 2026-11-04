import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!["DEALER", "SELLER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Only dealers and sellers can add inventory" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const listingCategory = (body.listingCategory || "CAR").toUpperCase();
    const make = (body.make || "").trim();
    const model = (body.model || "").trim();
    const priceUsd = Number(body.priceUsd) || 0;

    if (!make) {
      return NextResponse.json({ error: "Make / Manufacturer is required" }, { status: 400 });
    }
    if (!model) {
      return NextResponse.json({ error: "Model / Name is required" }, { status: 400 });
    }
    if (priceUsd <= 0) {
      return NextResponse.json({ error: "Base Price (USD) must be greater than 0" }, { status: 400 });
    }

    const year = Number(body.year) || new Date().getFullYear();
    const quantity = Math.max(1, parseInt(String(body.quantity || 1), 10) || 1);
    const floorPriceUsd = body.floorPriceUsd != null && body.floorPriceUsd !== ""
      ? Number(body.floorPriceUsd)
      : null;

    if (floorPriceUsd != null && floorPriceUsd > priceUsd) {
      return NextResponse.json(
        { error: `Floor price ($${floorPriceUsd}) cannot exceed base price ($${priceUsd})` },
        { status: 400 }
      );
    }

    // Determine tenant association
    const userTenant = await db.tenantMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tenantId: true, role: true },
    });
    const tenantId = userTenant?.tenantId || null;

    // Optional branch association
    let branchId = body.branchId || null;
    if (branchId) {
      const validBranch = await db.tenantBranch.findFirst({
        where: { id: branchId, ...(tenantId ? { tenantId } : {}) },
      });
      if (!validBranch) branchId = null;
    }

    // Duplicate detection check
    const scopeOr: any[] = [
      { sellerId: user.id },
      { createdById: user.id },
      ...(tenantId ? [{ tenantId }] : []),
    ];

    const duplicateChecks: any[] = [];
    if (body.stockNo?.trim()) {
      duplicateChecks.push({ stockNo: { equals: body.stockNo.trim(), mode: "insensitive" } });
    }
    if (body.chassisNo?.trim()) {
      duplicateChecks.push({ chassisNo: { equals: body.chassisNo.trim(), mode: "insensitive" } });
    }
    if (body.partNumber?.trim()) {
      duplicateChecks.push({ partNumber: { equals: body.partNumber.trim(), mode: "insensitive" } });
    }

    let existingVehicle: any = null;
    if (duplicateChecks.length > 0) {
      existingVehicle = await db.vehicle.findFirst({
        where: {
          OR: scopeOr,
          AND: [{ OR: duplicateChecks }],
        },
      });
    }

    // If listing already exists, increment stock and update pricing/safeguards
    if (existingVehicle) {
      const prevStock = (existingVehicle as any).stockQuantity ?? 1;
      const newStock = prevStock + quantity;

      const updateData: any = {
        stockQuantity: newStock,
        priceUsd: priceUsd > 0 ? priceUsd : existingVehicle.priceUsd,
      };
      if (floorPriceUsd != null) {
        updateData.floorPriceUsd = floorPriceUsd;
      }
      if (branchId) {
        updateData.branchId = branchId;
      }
      if (body.variant?.trim()) {
        updateData.variant = body.variant.trim();
      }

      const updated = await db.vehicle.update({
        where: { id: existingVehicle.id },
        data: updateData,
      });

      // Handle promo attachment if provided
      if (body.promoPriceTypeId && Number(body.promoValue) > 0) {
        const pt = await db.priceType.findUnique({
          where: { id: body.promoPriceTypeId },
        });
        if (pt) {
          const startDate = body.promoStartDate ? new Date(body.promoStartDate) : null;
          const endDate = body.promoEndDate ? new Date(body.promoEndDate) : null;

          // Deactivate prior active promos
          await db.itemPrice.updateMany({
            where: { vehicleId: updated.id, active: true },
            data: { active: false },
          });

          await db.itemPrice.create({
            data: {
              vehicleId: updated.id,
              priceTypeId: pt.id,
              value: Number(body.promoValue),
              currency: "USD",
              startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
              endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
              active: true,
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        action: "INCREMENTED",
        previousStock: prevStock,
        newStock,
        incrementedBy: quantity,
        vehicle: updated,
        message: `Existing listing found ("${updated.make} ${updated.model}"). Incremented stock by +${quantity} (Total: ${newStock} units) and updated pricing safeguards.`,
      });
    }

    // Auto-generate clean stock number if not supplied
    const stockNo = body.stockNo?.trim() || `STK-${listingCategory.slice(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Prepare category-specific payloads
    let categoryData: any = {};

    if (listingCategory === "CAR") {
      categoryData = {
        listingCategory: "CAR",
        bodyType: body.bodyType || "SUV",
        transmission: body.transmission || "AUTOMATIC",
        fuel: body.fuel || "PETROL",
        mileageKm: Number(body.mileageKm) || 0,
        engineCc: body.engineCc ? Number(body.engineCc) : null,
        drivetrain: body.drivetrain || "FWD",
        exteriorColor: body.exteriorColor?.trim() || null,
        seats: body.seats ? Number(body.seats) : 5,
        doors: body.doors ? Number(body.doors) : 4,
        steering: body.steering || "LEFT",
      };
    } else if (listingCategory === "MOTOR") {
      categoryData = {
        listingCategory: "MOTOR",
        bodyType: body.motorType || "SCOOTER",
        motorType: body.motorType || "SCOOTER",
        transmission: body.transmission || "AUTOMATIC",
        fuel: body.fuel || "PETROL",
        mileageKm: Number(body.mileageKm) || 0,
        engineCc: body.engineCc ? Number(body.engineCc) : 125,
        hasAbs: Boolean(body.hasAbs),
        startType: body.startType || "ELECTRIC",
        exteriorColor: body.exteriorColor?.trim() || null,
        seats: 2,
        doors: 0,
        steering: "NONE",
      };
    } else if (listingCategory === "SPARE_PART") {
      categoryData = {
        listingCategory: "SPARE_PART",
        partCategory: body.partCategory || "ENGINE_TRANSMISSION",
        partTarget: body.partTarget || "CAR",
        partCondition: body.partCondition || "BRAND_NEW",
        partNumber: body.partNumber?.trim() || null,
        oemBrand: body.oemBrand?.trim() || null,
        isOem: body.isOem !== undefined ? Boolean(body.isOem) : true,
        position: body.position || null,
        compatibleMake: body.compatibleMake?.trim() || null,
        compatibleModel: body.compatibleModel?.trim() || null,
        compatibleYearMin: body.compatibleYearMin ? Number(body.compatibleYearMin) : null,
        compatibleYearMax: body.compatibleYearMax ? Number(body.compatibleYearMax) : null,
        compatibleModels: body.compatibleModels?.trim() || null,
        bodyType: "PART",
        transmission: "NONE",
        fuel: "OTHER",
        mileageKm: 0,
      };
    }

    const vehicle = await db.vehicle.create({
      data: {
        sellerId: user.id,
        createdById: user.id,
        tenantId,
        branchId,
        make,
        model,
        variant: body.variant?.trim() || null,
        year,
        priceUsd,
        floorPriceUsd,
        stockNo,
        stockQuantity: quantity,
        chassisNo: body.chassisNo?.trim() || null,
        condition: body.condition || "USED",
        city: body.city?.trim() || "Phnom Penh",
        district: body.district?.trim() || null,
        description: body.description?.trim() || `${year} ${make} ${model}`,
        status: body.status || "PUBLISHED",
        featured: Boolean(body.featured),
        ...categoryData,
      },
    });

    // Optional promotional pricing attachment
    if (body.promoPriceTypeId && Number(body.promoValue) > 0) {
      const pt = await db.priceType.findUnique({
        where: { id: body.promoPriceTypeId },
      });
      if (pt) {
        const startDate = body.promoStartDate ? new Date(body.promoStartDate) : null;
        const endDate = body.promoEndDate ? new Date(body.promoEndDate) : null;

        await db.itemPrice.create({
          data: {
            vehicleId: vehicle.id,
            priceTypeId: pt.id,
            value: Number(body.promoValue),
            currency: "USD",
            startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
            endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
            active: true,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      action: "CREATED",
      previousStock: 0,
      newStock: quantity,
      incrementedBy: quantity,
      vehicle,
      message: `${listingCategory} listing "${make} ${model}" created successfully with initial stock of ${quantity} units.`,
    });
  } catch (err) {
    return toErrorResponse(err, "POST /api/seller/inventory/quick-add", "Failed to add inventory listing");
  }
}

