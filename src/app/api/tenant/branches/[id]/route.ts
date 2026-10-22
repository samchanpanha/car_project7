import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  nameKm: z.string().max(100).optional().nullable(),
  city: z.string().min(2).max(60).optional(),
  district: z.string().max(60).optional().nullable(),
  address: z.string().min(3).max(250).optional(),
  phone: z.string().max(30).optional().nullable(),
  telegram: z.string().max(50).optional().nullable(),
  isMain: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  openingHours: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { member, tenant } = await requireTenantMember();

    if (member.role !== "OWNER" && member.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Only dealership owners or managers can modify branches" },
        { status: 403 },
      );
    }

    const branch = await db.tenantBranch.findUnique({
      where: { id },
    });

    if (!branch || branch.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    const json = await req.json();
    const parsed = patchBranchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid branch data", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

    if (data.isMain) {
      await db.tenantBranch.updateMany({
        where: { tenantId: tenant.id },
        data: { isMain: false },
      });
    }

    const updated = await db.tenantBranch.update({
      where: { id },
      data,
    });

    return NextResponse.json({ branch: updated, ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/branches/[id] PATCH", "Failed to update branch");
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { member, tenant } = await requireTenantMember();

    if (member.role !== "OWNER" && member.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Only dealership owners or managers can delete branches" },
        { status: 403 },
      );
    }

    const branch = await db.tenantBranch.findUnique({
      where: { id },
    });

    if (!branch || branch.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    // Unlink any vehicles currently associated with this branch
    await db.vehicle.updateMany({
      where: { branchId: id } as any,
      data: { branchId: null } as any,
    });

    await db.tenantBranch.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/branches/[id] DELETE", "Failed to delete branch");
  }
}
