import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

export interface CsvPricingRow {
  identifier: string; // vehicleId, stockNo, or chassisNo
  priceTypeCode: string;
  value: number;
  startDate?: string;
  endDate?: string;
}

export function parsePricingCsv(csvText: string): CsvPricingRow[] {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const idIdx = header.findIndex((h) => ["vehicle_id", "vehicleid", "id", "stock_no", "stockno", "chassis_no", "chassisno"].includes(h));
  const typeIdx = header.findIndex((h) => ["price_type", "pricetype", "price_type_code", "type", "code"].includes(h));
  const valIdx = header.findIndex((h) => ["value", "price", "discount", "amount", "percent"].includes(h));
  const startIdx = header.findIndex((h) => ["start_date", "startdate", "start"].includes(h));
  const endIdx = header.findIndex((h) => ["end_date", "enddate", "end"].includes(h));

  if (idIdx === -1 || valIdx === -1) {
    throw new Error("CSV must include columns for vehicle identifier (vehicle_id or stock_no) and value");
  }

  const rows: CsvPricingRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const identifier = cols[idIdx];
    const valStr = cols[valIdx];
    if (!identifier || !valStr) continue;

    const value = parseFloat(valStr);
    if (Number.isNaN(value) || value <= 0) continue;

    const priceTypeCode = typeIdx !== -1 && cols[typeIdx]
      ? cols[typeIdx].toUpperCase()
      : "HOT_PRICE";

    const startDate = startIdx !== -1 && cols[startIdx] ? cols[startIdx] : undefined;
    const endDate = endIdx !== -1 && cols[endIdx] ? cols[endIdx] : undefined;

    rows.push({
      identifier,
      priceTypeCode,
      value,
      startDate,
      endDate,
    });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const contentType = req.headers.get("content-type") || "";

    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided in form-data" }, { status: 400 });
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
      return NextResponse.json({ error: "No valid pricing rows parsed from CSV" }, { status: 400 });
    }

    // Cache price types
    const allPriceTypes = await db.priceType.findMany();
    const priceTypeMap = new Map(allPriceTypes.map((pt) => [pt.code.toUpperCase(), pt]));

    const processed: any[] = [];
    const errors: Array<{ row: number; identifier: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pt = priceTypeMap.get(row.priceTypeCode.toUpperCase());
      if (!pt) {
        errors.push({ row: i + 2, identifier: row.identifier, error: `Unknown price type: ${row.priceTypeCode}` });
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
        errors.push({ row: i + 2, identifier: row.identifier, error: `Vehicle not found for identifier: ${row.identifier}` });
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
    return toErrorResponse(err, "POST /api/pricing/csv-import", err.message || "Failed to import CSV");
  }
}

