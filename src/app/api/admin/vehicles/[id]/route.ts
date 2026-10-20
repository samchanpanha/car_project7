import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "SOLD", "ARCHIVED"]).optional(),
    featured: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.featured !== undefined, {
    message: "At least one of status or featured is required",
  });

const STATUS_ACTION: Record<string, string> = {
  PUBLISHED: "LISTING_APPROVED",
  REJECTED: "LISTING_REJECTED",
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
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

    const vehicle = await db.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const data: { status?: string; featured?: boolean } = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.featured !== undefined) data.featured = parsed.data.featured;
    await db.vehicle.update({ where: { id }, data });

    if (parsed.data.status !== undefined) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: STATUS_ACTION[parsed.data.status] ?? "LISTING_STATUS_CHANGED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({ from: vehicle.status, to: parsed.data.status }),
        },
      });
    }
    if (parsed.data.featured !== undefined && parsed.data.featured !== vehicle.featured) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: parsed.data.featured ? "LISTING_FEATURED" : "LISTING_UNFEATURED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({ from: vehicle.featured, to: parsed.data.featured }),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/admin/vehicles/[id] PATCH", "Failed to update vehicle");
  }
}
