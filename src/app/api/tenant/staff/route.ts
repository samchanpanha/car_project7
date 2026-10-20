import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  canManageTenant,
  requireTenantMember,
  toErrorResponse,
} from "@/lib/api/guards";
import type { TenantMemberDTO, TenantRole } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

function toMemberDTO(member: {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: Date;
  user: { name: string; phone: string };
}): TenantMemberDTO {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    phone: member.user.phone,
    role: member.role as TenantRole,
    status: member.status as TenantMemberDTO["status"],
    createdAt: member.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();

    const members = await db.tenantMember.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, phone: true } } },
    });

    return NextResponse.json(members.map(toMemberDTO));
  } catch (err) {
    return toErrorResponse(err, "api/tenant/staff GET", "Failed to load staff");
  }
}

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+855\d{7,9}$/, "phone must be a Cambodian number like +85512345678"),
  role: z.enum(["SALES_STAFF", "INVENTORY_MANAGER", "MANAGER"]),
});

export async function POST(req: Request) {
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

    const parsed = inviteSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const { name, phone, role } = parsed.data;

    const existing = await db.user.findUnique({ where: { phone } });
    if (existing) {
      // Already a member of ANOTHER tenant → reject.
      const otherMembership = await db.tenantMember.findFirst({
        where: { userId: existing.id, NOT: { tenantId: tenant.id } },
        select: { id: true },
      });
      if (otherMembership) {
        return NextResponse.json(
          { error: "This user already belongs to another dealership" },
          { status: 400 },
        );
      }
      // Already a member of MY tenant → never downgrade the OWNER.
      const ownMembership = await db.tenantMember.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: existing.id } },
      });
      if (ownMembership && ownMembership.role === "OWNER") {
        return NextResponse.json(
          { error: "This user is the tenant owner and cannot be re-invited" },
          { status: 400 },
        );
      }
    }

    // Upsert the user by phone (create as DEALER; update name when different).
    const user = await db.user.upsert({
      where: { phone },
      create: { phone, name, role: "DEALER", phoneVerified: false },
      update: existing && existing.name !== name ? { name } : {},
    });

    // Upsert membership (unique tenant+user) with the invited role.
    const upserted = await db.tenantMember.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role, status: "ACTIVE" },
      update: { role },
      include: { user: { select: { name: true, phone: true } } },
    });

    await db.auditLog.create({
      data: {
        actorId: member.userId,
        action: "STAFF_INVITED",
        entity: "TenantMember",
        entityId: upserted.id,
        metaJson: JSON.stringify({ name, phone, role }),
      },
    });

    return NextResponse.json(toMemberDTO(upserted), { status: 201 });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/staff POST", "Failed to invite staff");
  }
}
