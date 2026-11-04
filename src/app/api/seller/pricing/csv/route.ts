import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse, canWriteTenant } from "@/lib/api/guards";
import { parsePricingCsv } from "@/app/api/pricing/csv-import/route";

export interface CsvInventoryRow {
  category: "CAR" | "MOTOR" | "SPARE_PART";
  make: string;
  model: string;
  variant?: string;
  year: number;
  basePrice: number;
  floorPrice?: number;
  stockNo?: string;
  chassisNo?: string;
  condition?: string;
  quantity?: number;
  promoCode?: string;
  promoValue?: number;
  startDate?: string;
  endDate?: string;
}

function parseInventoryCsv(csvText: string): CsvInventoryRow[] {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const catIdx = header.findIndex((h) => ["category", "listing_category", "type"].includes(h));
  const makeIdx = header.findIndex((h) => ["make", "brand", "manufacturer"].includes(h));
  const modelIdx = header.findIndex((h) => ["model", "name", "item_name"].includes(h));
  const variantIdx = header.findIndex((h) => ["variant", "trim", "grade"].includes(h));
  const yearIdx = header.findIndex((h) => ["year"].includes(h));
  const priceIdx = header.findIndex((h) => ["base_price", "price_usd", "price", "baseprice"].includes(h));
  const floorIdx = header.findIndex((h) => ["floor_price", "floor_price_usd", "floor", "floorprice"].includes(h));
  const stockIdx = header.findIndex((h) => ["stock_no", "stockno", "stock"].includes(h));
  const chassisIdx = header.findIndex((h) => ["chassis_no", "chassisno", "vin", "part_no", "part_number"].includes(h));
  const condIdx = header.findIndex((h) => ["condition", "state"].includes(h));
  const qtyIdx = header.findIndex((h) => ["quantity", "qty", "stock_quantity", "count", "units"].includes(h));
  const promoCodeIdx = header.findIndex((h) => ["promo_code", "price_type", "promo_tier", "tier"].includes(h));
  const promoValIdx = header.findIndex((h) => ["promo_value", "value", "discount", "discount_value"].includes(h));
  const startIdx = header.findIndex((h) => ["start_date", "startdate"].includes(h));
  const endIdx = header.findIndex((h) => ["end_date", "enddate"].includes(h));

  if (makeIdx === -1 || modelIdx === -1 || priceIdx === -1) {
    throw new Error("Inventory CSV must include columns for make, model, and base_price");
  }

  const rows: CsvInventoryRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const make = cols[makeIdx];
    const model = cols[modelIdx];
    const priceStr = cols[priceIdx];
    if (!make || !model || !priceStr) continue;

    const basePrice = parseFloat(priceStr);
    if (Number.isNaN(basePrice) || basePrice <= 0) continue;

    const rawCat = catIdx !== -1 && cols[catIdx] ? cols[catIdx].toUpperCase() : "CAR";
    let category: "CAR" | "MOTOR" | "SPARE_PART" = "CAR";
    if (rawCat.includes("MOTOR") || rawCat.includes("BIKE")) category = "MOTOR";
    else if (rawCat.includes("PART") || rawCat.includes("SPARE")) category = "SPARE_PART";

    const yearVal = yearIdx !== -1 && cols[yearIdx] ? parseInt(cols[yearIdx], 10) : new Date().getFullYear();
    const floorPrice = floorIdx !== -1 && cols[floorIdx] ? parseFloat(cols[floorIdx]) : undefined;
    const stockNo = stockIdx !== -1 && cols[stockIdx] ? cols[stockIdx] : undefined;
    const chassisNo = chassisIdx !== -1 && cols[chassisIdx] ? cols[chassisIdx] : undefined;
    const variant = variantIdx !== -1 && cols[variantIdx] ? cols[variantIdx] : undefined;
    const condition = condIdx !== -1 && cols[condIdx] ? cols[condIdx] : "USED";
    const quantity = qtyIdx !== -1 && cols[qtyIdx] ? Math.max(1, parseInt(cols[qtyIdx], 10) || 1) : 1;
    const promoCode = promoCodeIdx !== -1 && cols[promoCodeIdx] ? cols[promoCodeIdx].toUpperCase() : undefined;
    const promoVal = promoValIdx !== -1 && cols[promoValIdx] ? parseFloat(cols[promoValIdx]) : undefined;
    const startDate = startIdx !== -1 && cols[startIdx] ? cols[startIdx] : undefined;
    const endDate = endIdx !== -1 && cols[endIdx] ? cols[endIdx] : undefined;

    rows.push({
      category,
      make,
      model,
      variant,
      year: Number.isNaN(yearVal) ? new Date().getFullYear() : yearVal,
      basePrice,
      floorPrice: floorPrice && !Number.isNaN(floorPrice) ? floorPrice : undefined,
      stockNo,
      chassisNo,
      condition,
      quantity,
      promoCode,
      promoValue: promoVal && !Number.isNaN(promoVal) ? promoVal : undefined,
      startDate,
      endDate,
    });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const contentType = req.headers.get("content-type") || "";

    let csvText = "";
    let requestedMode = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      csvText = await file.text();
      requestedMode = (formData.get("mode") as string) || "";
    } else {
      const body = await req.json().catch(() => ({}));
      csvText = body.csv || "";
      requestedMode = body.mode || "";
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "Empty CSV content" }, { status: 400 });
    }

    // Determine import mode: check first line headers
    const firstLine = csvText.trim().split(/\r?\n/)[0].toLowerCase();
    const isInventoryImport =
      requestedMode === "CREATE_LISTINGS" ||
      (firstLine.includes("make") && (firstLine.includes("model") || firstLine.includes("name")));

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
    const tenantId = writeTenantIds[0] || null;
    const isPlatformAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";

    // ==========================================
    // MODE 1: Create New Listings (Cars, Motors, Parts)
    // ==========================================
    if (isInventoryImport) {
      const rows = parseInventoryCsv(csvText);
      if (rows.length === 0) {
        return NextResponse.json({ error: "No valid vehicle rows found in CSV. Required columns: make, model, base_price" }, { status: 400 });
      }

      const created: any[] = [];
      const incremented: any[] = [];
      const errors: Array<{ row: number; identifier: string; error: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowQty = row.quantity && row.quantity > 0 ? row.quantity : 1;
        try {
          // Scope conditions
          const scopeOr: any[] = [
            { sellerId: user.id },
            { createdById: user.id },
            ...(tenantId ? [{ tenantId }] : []),
          ];

          // Check for existing duplicate listing
          const duplicateChecks: any[] = [];
          if (row.stockNo) {
            duplicateChecks.push({ stockNo: { equals: row.stockNo, mode: "insensitive" } });
          }
          if (row.chassisNo) {
            duplicateChecks.push({ chassisNo: { equals: row.chassisNo, mode: "insensitive" } });
            if (row.category === "SPARE_PART") {
              duplicateChecks.push({ partNumber: { equals: row.chassisNo, mode: "insensitive" } });
            }
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

          if (existingVehicle) {
            const prevStock = (existingVehicle as any).stockQuantity ?? 1;
            const newStock = prevStock + rowQty;
            const updateData: any = {
              stockQuantity: newStock,
              priceUsd: row.basePrice > 0 ? row.basePrice : existingVehicle.priceUsd,
            };
            if (row.floorPrice != null && row.floorPrice > 0) {
              updateData.floorPriceUsd = row.floorPrice;
            }
            if (row.variant) {
              updateData.variant = row.variant;
            }

            const updated = await db.vehicle.update({
              where: { id: existingVehicle.id },
              data: updateData,
            });

            // Optional promotional price attach/update
            if (row.promoCode && row.promoValue && row.promoValue > 0) {
              const pt = priceTypeMap.get(row.promoCode);
              if (pt) {
                const startDate = row.startDate ? new Date(row.startDate) : null;
                const endDate = row.endDate ? new Date(row.endDate) : null;

                await db.itemPrice.updateMany({
                  where: { vehicleId: updated.id, active: true },
                  data: { active: false },
                });

                await db.itemPrice.create({
                  data: {
                    vehicleId: updated.id,
                    priceTypeId: pt.id,
                    value: row.promoValue,
                    currency: "USD",
                    startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
                    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
                    active: true,
                  },
                });
              }
            }

            incremented.push(updated);
            continue;
          }

          const stockNo = row.stockNo || `STK-${row.category.slice(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;

          let categoryData: any = {};
          if (row.category === "CAR") {
            categoryData = {
              listingCategory: "CAR",
              bodyType: "SUV",
              transmission: "AUTOMATIC",
              fuel: "PETROL",
              mileageKm: 0,
              drivetrain: "FWD",
              seats: 5,
              doors: 4,
              steering: "LEFT",
            };
          } else if (row.category === "MOTOR") {
            categoryData = {
              listingCategory: "MOTOR",
              bodyType: "SCOOTER",
              motorType: "SCOOTER",
              transmission: "AUTOMATIC",
              fuel: "PETROL",
              mileageKm: 0,
              engineCc: 125,
              hasAbs: false,
              startType: "ELECTRIC",
              seats: 2,
              doors: 0,
            };
          } else {
            categoryData = {
              listingCategory: "SPARE_PART",
              partCategory: "ENGINE_TRANSMISSION",
              partTarget: "CAR",
              partCondition: "BRAND_NEW",
              bodyType: "PART",
              transmission: "NONE",
              fuel: "OTHER",
              mileageKm: 0,
              partNumber: row.chassisNo || null,
            };
          }

          const vehicle = await db.vehicle.create({
            data: {
              sellerId: user.id,
              createdById: user.id,
              tenantId,
              make: row.make,
              model: row.model,
              variant: row.variant || null,
              year: row.year,
              priceUsd: row.basePrice,
              floorPriceUsd: row.floorPrice || null,
              stockNo,
              stockQuantity: rowQty,
              chassisNo: row.chassisNo || null,
              condition: row.condition || "USED",
              city: "Phnom Penh",
              description: `${row.year} ${row.make} ${row.model}`,
              status: "PUBLISHED",
              ...categoryData,
            },
          });

          // Optional promotional price attach
          if (row.promoCode && row.promoValue && row.promoValue > 0) {
            const pt = priceTypeMap.get(row.promoCode);
            if (pt) {
              const startDate = row.startDate ? new Date(row.startDate) : null;
              const endDate = row.endDate ? new Date(row.endDate) : null;

              await db.itemPrice.create({
                data: {
                  vehicleId: vehicle.id,
                  priceTypeId: pt.id,
                  value: row.promoValue,
                  currency: "USD",
                  startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
                  endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
                  active: true,
                },
              });
            }
          }

          created.push(vehicle);
        } catch (e: any) {
          errors.push({
            row: i + 2,
            identifier: `${row.make} ${row.model}`,
            error: e.message || "Failed to create listing",
          });
        }
      }

      return NextResponse.json({
        success: true,
        mode: "CREATE_LISTINGS",
        importedCount: created.length + incremented.length,
        createdCount: created.length,
        incrementedCount: incremented.length,
        failedCount: errors.length,
        totalRows: rows.length,
        errors,
        message: `Successfully processed ${created.length + incremented.length} listings (${created.length} new listings created, ${incremented.length} existing inventory stock incremented, ${errors.length} skipped)`,
      });
    }

    // ==========================================
    // MODE 2: Update Promotional Pricing
    // ==========================================
    const rows = parsePricingCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

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

      processed.push({ vehicleId: vehicle.id, itemPriceId: itemPrice.id });
    }

    return NextResponse.json({
      success: true,
      mode: "UPDATE_PRICING",
      importedCount: processed.length,
      updatedCount: processed.length,
      failedCount: errors.length,
      totalRows: rows.length,
      errors,
      message: `Updated promotional prices on ${processed.length} listings (${errors.length} skipped)`,
    });
  } catch (err) {
    return toErrorResponse(err, "POST /api/seller/pricing/csv", "Failed to process CSV import");
  }
}
