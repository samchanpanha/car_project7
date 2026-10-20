import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import type { AppointmentDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

function firstImage(urls: { sortOrder: number; url: string }[]): string | null {
  if (urls.length === 0) return null;
  return [...urls].sort((a, b) => a.sortOrder - b.sortOrder)[0].url;
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    const rows = await db.appointment.findMany({
      where: { buyerId: user.id },
      orderBy: { scheduledAt: "desc" },
      include: { vehicle: { include: { images: true } } },
    });

    // Appointment.sellerId is a plain column (no relation) — resolve names.
    const sellerIds = [...new Set(rows.map((a) => a.sellerId))];
    const sellers = await db.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, name: true },
    });
    const sellerNames = new Map(sellers.map((s) => [s.id, s.name]));

    const items: AppointmentDTO[] = rows.map((a) => ({
      id: a.id,
      vehicle: {
        id: a.vehicle.id,
        make: a.vehicle.make,
        model: a.vehicle.model,
        year: a.vehicle.year,
        priceUsd: a.vehicle.priceUsd,
        thumbnail: firstImage(a.vehicle.images),
      },
      sellerName: sellerNames.get(a.sellerId) ?? "Seller",
      scheduledAt: a.scheduledAt.toISOString(),
      status: a.status as AppointmentDTO["status"],
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(
      err,
      "api/account/appointments GET",
      "Failed to load appointments",
    );
  }
}

const createSchema = z.object({
  vehicleId: z.string().min(1),
  scheduledAt: z.iso.datetime({ message: "scheduledAt must be an ISO datetime" }),
  notes: z.string().max(300).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const when = new Date(parsed.data.scheduledAt);
    if (when.getTime() <= Date.now()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }

    const vehicle = await db.vehicle.findUnique({
      where: { id: parsed.data.vehicleId },
      include: { seller: { select: { id: true, name: true } } },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    if (vehicle.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Vehicle is not available for appointments" },
        { status: 400 },
      );
    }

    const duplicate = await db.appointment.findFirst({
      where: {
        buyerId: user.id,
        vehicleId: vehicle.id,
        status: { in: ["REQUESTED", "CONFIRMED"] },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "You already have an active appointment for this vehicle" },
        { status: 400 },
      );
    }

    const created = await db.appointment.create({
      data: {
        vehicleId: vehicle.id,
        buyerId: user.id,
        sellerId: vehicle.sellerId,
        tenantId: vehicle.tenantId,
        scheduledAt: when,
        status: "REQUESTED",
        notes: parsed.data.notes ?? null,
      },
    });

    const dto: AppointmentDTO = {
      id: created.id,
      vehicle: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        priceUsd: vehicle.priceUsd,
        thumbnail: null,
      },
      sellerName: vehicle.seller.name,
      scheduledAt: created.scheduledAt.toISOString(),
      status: created.status as AppointmentDTO["status"],
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    return toErrorResponse(
      err,
      "api/account/appointments POST",
      "Failed to create appointment",
    );
  }
}
