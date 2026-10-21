import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((v) => v.verification !== undefined || v.status !== undefined, {
    message: "At least one of verification or status is required",
  });

const VERIFICATION_ACTION: Record<string, string> = {
  VERIFIED: "TENANT_VERIFIED",
  REJECTED: "TENANT_REJECTED",
  PENDING: "TENANT_UNVERIFIED",
  UNVERIFIED: "TENANT_UNVERIFIED",
};

const STATUS_ACTION: Record<string, string> = {
  SUSPENDED: "TENANT_SUSPENDED",
  ACTIVE: "TENANT_ACTIVATED",
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

    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const data: { verification?: string; verified?: boolean; status?: string } = {};
    if (parsed.data.verification !== undefined) {
      data.verification = parsed.data.verification;
      data.verified = parsed.data.verification === "VERIFIED";
    }
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
    }
    await db.tenant.update({ where: { id }, data });

    // One audit entry per changed field.
    if (parsed.data.verification !== undefined) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: VERIFICATION_ACTION[parsed.data.verification] ?? "TENANT_UNVERIFIED",
          entity: "Tenant",
          entityId: id,
          metaJson: JSON.stringify({
            from: tenant.verification,
            to: parsed.data.verification,
          }),
        },
      });
    }
    if (parsed.data.status !== undefined) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: STATUS_ACTION[parsed.data.status] ?? "TENANT_ACTIVATED",
          entity: "Tenant",
          entityId: id,
          metaJson: JSON.stringify({ from: tenant.status, to: parsed.data.status }),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/admin/tenants/[id] PATCH", "Failed to update tenant");
  }
}
