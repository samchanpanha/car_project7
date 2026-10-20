import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoUser } from "@/lib/session";
import { toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getDemoUser();
    const rows = await db.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { vehicle: { include: vehicleCardInclude } },
    });

    return NextResponse.json({
      vehicleIds: rows.map((r) => r.vehicleId),
      favorites: rows.map((r) => ({
        vehicleId: r.vehicleId,
        addedAt: r.createdAt.toISOString(),
        vehicle: toCardDTO(r.vehicle),
      })),
    });
  } catch (err) {
    console.error("[api/favorites] GET failed:", err);
    return NextResponse.json({ error: "Failed to load favorites" }, { status: 500 });
  }
}

const addFavoriteSchema = z.object({ vehicleId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = addFavoriteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }

    const user = await getDemoUser();
    const vehicle = await db.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    await db.favorite.upsert({
      where: { userId_vehicleId: { userId: user.id, vehicleId: vehicle.id } },
      create: { userId: user.id, vehicleId: vehicle.id },
      update: {},
    });

    return NextResponse.json({ ok: true, favorited: true });
  } catch (err) {
    console.error("[api/favorites] POST failed:", err);
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const vehicleId = new URL(req.url).searchParams.get("vehicleId");
    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId query param is required" }, { status: 400 });
    }

    const user = await getDemoUser();
    await db.favorite.deleteMany({ where: { userId: user.id, vehicleId } });

    return NextResponse.json({ ok: true, favorited: false });
  } catch (err) {
    console.error("[api/favorites] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}
