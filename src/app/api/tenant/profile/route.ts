import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  bio: z.string().max(2000).optional().nullable(),
  bioKm: z.string().max(2000).optional().nullable(),
  city: z.string().min(1).max(120).optional(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  telegram: z.string().max(80).optional().nullable(),
  logoUrl: z.string().max(500).optional().nullable(),
});

export async function PATCH(req: Request) {
  try {
    const { member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    await db.tenant.update({ where: { id: tenant.id }, data: parsed.data });

    await db.auditLog.create({
      data: {
        actorId: member.userId,
        action: "TENANT_PROFILE_UPDATED",
        entity: "Tenant",
        entityId: tenant.id,
        metaJson: JSON.stringify({ fields: Object.keys(parsed.data) }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/profile PATCH", "Failed to update tenant profile");
  }
}
