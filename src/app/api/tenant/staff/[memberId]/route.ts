import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canManageTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "SALES_STAFF", "INVENTORY_MANAGER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  try {
    const { member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { memberId } = await params;

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
    if (!parsed.data.role && !parsed.data.status) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Member must belong to MY tenant.
    const target = await db.tenantMember.findFirst({
      where: { id: memberId, tenantId: tenant.id },
      include: { user: { select: { name: true } } },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Never allow modifying OWNER members.
    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "The tenant owner cannot be modified" },
        { status: 400 },
      );
    }

    // Block changes that would leave the tenant without an OWNER.
    if (target.role !== "OWNER" && parsed.data.role === undefined) {
      // role untouched — fine.
    }

    const updated = await db.tenantMember.update({
      where: { id: target.id },
      data: {
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        actorId: member.userId,
        action: parsed.data.role ? "STAFF_ROLE_CHANGED" : "STAFF_STATUS_CHANGED",
        entity: "TenantMember",
        entityId: updated.id,
        metaJson: JSON.stringify({
          memberName: target.user.name,
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
        }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/staff/[memberId] PATCH", "Failed to update member");
  }
}
