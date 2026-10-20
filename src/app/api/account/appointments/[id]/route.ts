import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ status: z.literal("CANCELLED") });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "status must be \"CANCELLED\"" }, { status: 400 });
    }

    // Appointment must belong to the current buyer.
    const appointment = await db.appointment.findFirst({
      where: { id, buyerId: user.id },
    });
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    await db.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(
      err,
      "api/account/appointments/[id] PATCH",
      "Failed to cancel appointment",
    );
  }
}
