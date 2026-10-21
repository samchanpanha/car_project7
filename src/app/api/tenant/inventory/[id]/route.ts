import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canWriteTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "SOLD", "ARCHIVED"]).optional(),
    priceUsd: z.number().positive().optional(),
    featured: z.boolean().optional(),
  })
  .refine(
    (v) => v.status !== undefined || v.priceUsd !== undefined || v.featured !== undefined,
    { message: "At least one of status, priceUsd or featured is required" },
  );

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

    // Vehicle must belong to this tenant.
    const vehicle = await db.vehicle.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Featured slot check against the plan's featuredLimit (skip when un-featuring).
    if (parsed.data.featured === true && !vehicle.featured) {
      const subscription = await db.subscription.findUnique({
        where: { tenantId: tenant.id },
      });
      const featuredLimit = subscription?.featuredLimit ?? 0;
      const featuredCount = await db.vehicle.count({
        where: { tenantId: tenant.id, featured: true, id: { not: vehicle.id } },
      });
      if (featuredCount >= featuredLimit) {
        return NextResponse.json(
          { error: "Featured limit reached for your plan" },
          { status: 400 },
        );
      }
    }

    const data: { status?: string; priceUsd?: number; featured?: boolean } = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.priceUsd !== undefined) data.priceUsd = parsed.data.priceUsd;
    if (parsed.data.featured !== undefined) data.featured = parsed.data.featured;
    await db.vehicle.update({ where: { id }, data });

    if (parsed.data.status !== undefined && parsed.data.status !== vehicle.status) {
      await db.auditLog.create({
        data: {
          actorId: member.userId,
          action: "LISTING_STATUS_CHANGED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({ from: vehicle.status, to: parsed.data.status }),
        },
      });
    }
    if (parsed.data.priceUsd !== undefined && parsed.data.priceUsd !== vehicle.priceUsd) {
      await db.auditLog.create({
        data: {
          actorId: member.userId,
          action: "LISTING_PRICE_UPDATED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({ from: vehicle.priceUsd, to: parsed.data.priceUsd }),
        },
      });
    }
    if (parsed.data.featured !== undefined && parsed.data.featured !== vehicle.featured) {
      await db.auditLog.create({
        data: {
          actorId: member.userId,
          action: parsed.data.featured ? "LISTING_FEATURED" : "LISTING_UNFEATURED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({ from: vehicle.featured, to: parsed.data.featured }),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/inventory/[id] PATCH", "Failed to update vehicle");
  }
}
