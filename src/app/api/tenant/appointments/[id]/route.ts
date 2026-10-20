import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canWriteTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { member, tenant } = await requireTenantMember();
    if (!canWriteTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    // Appointment must be on a vehicle belonging to this tenant.
    const appointment = await db.appointment.findFirst({
      where: { id, vehicle: { tenantId: tenant.id } },
    });
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    await db.appointment.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    await db.auditLog.create({
      data: {
        actorId: member.userId,
        action: "APPOINTMENT_STATUS_CHANGED",
        entity: "Appointment",
        entityId: id,
        metaJson: JSON.stringify({ from: appointment.status, to: parsed.data.status }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(
      err,
      "api/tenant/appointments/[id] PATCH",
      "Failed to update appointment",
    );
  }
}
