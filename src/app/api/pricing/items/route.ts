import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";
import { z } from "zod";

const setItemPriceSchema = z.object({
  vehicleId: z.string().min(1),
  priceTypeId: z.string().min(1),
  value: z.number().positive(),
  currency: z.string().default("USD"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicleId");

    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }

    const vehicle = await db.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        itemPrices: {
          include: { priceType: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const effective = resolveEffectivePrice(vehicle as any);

    return NextResponse.json({
      vehicleId,
      basePriceUsd: vehicle.priceUsd,
      floorPriceUsd: vehicle.floorPriceUsd,
      effectivePricing: effective,
      itemPrices: vehicle.itemPrices,
    });
  } catch (err) {
    return toErrorResponse(err, "GET /api/pricing/items", "Failed to get item prices");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = setItemPriceSchema.parse(body);

    const vehicle = await db.vehicle.findUnique({
      where: { id: parsed.vehicleId },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const priceType = await db.priceType.findUnique({
      where: { id: parsed.priceTypeId },
    });
    if (!priceType) {
      return NextResponse.json({ error: "Price type not found" }, { status: 404 });
    }

    const itemPrice = await db.itemPrice.create({
      data: {
        vehicleId: parsed.vehicleId,
        priceTypeId: parsed.priceTypeId,
        value: parsed.value,
        currency: parsed.currency,
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
        active: parsed.active,
      },
      include: {
        priceType: true,
      },
    });

    // Re-fetch vehicle with itemPrices to compute new effective price
    const updatedVehicle = await db.vehicle.findUnique({
      where: { id: parsed.vehicleId },
      include: {
        itemPrices: {
          include: { priceType: true },
        },
      },
    });

    const effective = resolveEffectivePrice(updatedVehicle as any);

    return NextResponse.json({
      itemPrice,
      effectivePricing: effective,
    }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid item price payload", issues: err.issues }, { status: 400 });
    }
    return toErrorResponse(err, "POST /api/pricing/items", "Failed to set item price");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    await db.itemPrice.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, "DELETE /api/pricing/items", "Failed to delete item price");
  }
}

