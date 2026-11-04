import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { HttpError, toErrorResponse, canWriteTenant } from "@/lib/api/guards";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";
import { z } from "zod";

async function verifyVehicleOwnership(vehicleId: string, userId: string, role: string) {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      tenant: {
        include: {
          members: { where: { userId, status: "ACTIVE" } },
        },
      },
      itemPrices: {
        include: { priceType: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vehicle) {
    throw new HttpError(404, "Vehicle not found");
  }

  // Admins bypass ownership
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return vehicle;
  }

  // Direct seller check
  if (vehicle.sellerId === userId || vehicle.createdById === userId) {
    return vehicle;
  }

  // Tenant / Dealership check
  if (vehicle.tenant && vehicle.tenant.members.length > 0) {
    const member = vehicle.tenant.members[0];
    if (canWriteTenant(member.role)) {
      return vehicle;
    }
  }

  throw new HttpError(403, "You do not have permission to manage pricing for this vehicle");
}

const sellerItemPriceSchema = z.object({
  vehicleId: z.string().min(1),
  priceTypeId: z.string().min(1),
  value: z.number().positive(),
  floorPriceUsd: z.number().nonnegative().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicleId");

    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }

    const vehicle = await verifyVehicleOwnership(vehicleId, user.id, user.role);
    const effective = resolveEffectivePrice(vehicle as any);

    return NextResponse.json({
      vehicleId: vehicle.id,
      basePriceUsd: vehicle.priceUsd,
      floorPriceUsd: vehicle.floorPriceUsd,
      effectivePricing: effective,
      itemPrices: vehicle.itemPrices,
    });
  } catch (err) {
    return toErrorResponse(err, "GET /api/seller/pricing/item", "Failed to get item pricing");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const parsed = sellerItemPriceSchema.parse(body);

    const vehicle = await verifyVehicleOwnership(parsed.vehicleId, user.id, user.role);

    const priceType = await db.priceType.findUnique({
      where: { id: parsed.priceTypeId },
    });
    if (!priceType || !priceType.active) {
      return NextResponse.json({ error: "Price type not found or inactive" }, { status: 404 });
    }

    // Update floor price on vehicle if supplied
    if (parsed.floorPriceUsd !== undefined) {
      await db.vehicle.update({
        where: { id: vehicle.id },
        data: { floorPriceUsd: parsed.floorPriceUsd },
      });
      vehicle.floorPriceUsd = parsed.floorPriceUsd;
    }

    const startDate = parsed.startDate ? new Date(parsed.startDate) : null;
    const endDate = parsed.endDate ? new Date(parsed.endDate) : null;

    // Create promotional pricing rule
    const itemPrice = await db.itemPrice.create({
      data: {
        vehicleId: vehicle.id,
        priceTypeId: priceType.id,
        value: parsed.value,
        currency: "USD",
        startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
        endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
        active: parsed.active,
      },
      include: {
        priceType: true,
      },
    });

    const effective = resolveEffectivePrice({
      id: vehicle.id,
      priceUsd: vehicle.priceUsd,
      floorPriceUsd: vehicle.floorPriceUsd,
      itemPrices: [itemPrice],
    });

    return NextResponse.json({
      success: true,
      itemPrice,
      effectivePricing: effective,
    }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid pricing payload", issues: err.issues }, { status: 400 });
    }
    return toErrorResponse(err, "POST /api/seller/pricing/item", "Failed to save promotional price");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicleId");
    const id = searchParams.get("id");

    if (!vehicleId && !id) {
      return NextResponse.json({ error: "vehicleId or id is required" }, { status: 400 });
    }

    if (vehicleId) {
      await verifyVehicleOwnership(vehicleId, user.id, user.role);
      await db.itemPrice.deleteMany({
        where: { vehicleId },
      });
    } else if (id) {
      const item = await db.itemPrice.findUnique({ where: { id } });
      if (!item) return NextResponse.json({ success: true });
      await verifyVehicleOwnership(item.vehicleId, user.id, user.role);
      await db.itemPrice.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, "DELETE /api/seller/pricing/item", "Failed to remove promotional price");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const { vehicleId, floorPriceUsd } = body;
    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }
    await verifyVehicleOwnership(vehicleId, user.id, user.role);
    const updated = await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        floorPriceUsd: floorPriceUsd === null || floorPriceUsd === "" || floorPriceUsd === undefined ? null : Number(floorPriceUsd),
      },
    });
    return NextResponse.json({ success: true, vehicle: updated });
  } catch (err) {
    return toErrorResponse(err, "PATCH /api/seller/pricing/item", "Failed to update floor price");
  }
}
