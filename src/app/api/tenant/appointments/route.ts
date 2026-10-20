import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import type { TenantAppointmentDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();

    const appointments = await db.appointment.findMany({
      where: { vehicle: { tenantId: tenant.id } },
      orderBy: { scheduledAt: "desc" },
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true } },
        buyer: { select: { id: true, name: true } },
      },
    });

    const rows: TenantAppointmentDTO[] = appointments.map((a) => ({
      id: a.id,
      vehicle: {
        id: a.vehicle.id,
        make: a.vehicle.make,
        model: a.vehicle.model,
        year: a.vehicle.year,
      },
      buyer: { id: a.buyer.id, name: a.buyer.name },
      scheduledAt: a.scheduledAt.toISOString(),
      status: a.status as TenantAppointmentDTO["status"],
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(
      err,
      "api/tenant/appointments GET",
      "Failed to load tenant appointments",
    );
  }
}
