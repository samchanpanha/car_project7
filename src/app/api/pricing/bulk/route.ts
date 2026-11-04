import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";
import { z } from "zod";

const bulkApplyPricingSchema = z.object({
  vehicleIds: z.array(z.string()).min(1),
  priceTypeId: z.string().min(1),
  value: z.number().positive(),
  currency: z.string().default("USD"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = bulkApplyPricingSchema.parse(body);

    const priceType = await db.priceType.findUnique({
      where: { id: parsed.priceTypeId },
    });
    if (!priceType) {
      return NextResponse.json({ error: "Price type not found" }, { status: 404 });
    }

    const startDate = parsed.startDate ? new Date(parsed.startDate) : null;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : null;

    const vehicles = await db.vehicle.findMany({
      where: { id: { in: parsed.vehicleIds } },
    });

    const results: Array<{
      vehicleId: string;
      stockNo?: string | null;
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
          currency: parsed.currency,
          startDate,
          endDate,
          active: true,
        },
      });

      const effective = resolveEffectivePrice({
        id: v.id,
        priceUsd: v.priceUsd,
        floorPriceUsd: v.floorPriceUsd,
        itemPrices: [
          {
            ...itemPrice,
            priceType,
          },
        ],
      });

      if (effective.floorEnforced) {
        floorEnforcedCount += 1;
      }

      results.push({
        vehicleId: v.id,
        stockNo: v.stockNo,
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
      priceType: {
        code: priceType.code,
        label: priceType.label,
        mode: priceType.mode,
      },
      results,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid bulk pricing payload", issues: err.issues }, { status: 400 });
    }
    return toErrorResponse(err, "POST /api/pricing/bulk", "Failed to apply bulk pricing");
  }
}

