import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const abuseSchema = z.object({
  vehicleId: z.string().min(1),
  reason: z.enum(["SCAM", "WRONG_INFO", "DUPLICATE", "OFFENSIVE", "SOLD", "OTHER"]),
  details: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = abuseSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const { vehicleId, reason, details } = parsed.data;
    const user = await getCurrentUser();

    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    await db.reportedContent.create({
      data: { vehicleId, reason, details: details ?? null },
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "CONTENT_REPORTED",
        entity: "Vehicle",
        entityId: vehicleId,
        metaJson: JSON.stringify({ reason, details: details ?? null }),
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/reports/abuse] POST failed:", err);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
