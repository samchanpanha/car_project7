import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { assertBranchCreationAllowed, isProOrEnterprisePlan } from "@/lib/api/branch-guards";
import { refreshExpiredSubscription } from "@/lib/api/payments";
import type { TenantBranchDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const branchSchema = z.object({
  name: z.string().min(2).max(100),
  nameKm: z.string().max(100).optional().nullable(),
  city: z.string().min(2).max(60).default("Phnom Penh"),
  district: z.string().max(60).optional().nullable(),
  address: z.string().min(3).max(250),
  phone: z.string().max(30).optional().nullable(),
  telegram: z.string().max(50).optional().nullable(),
  isMain: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  openingHours: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
});

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();

    const rawSub = await db.subscription.findUnique({ where: { tenantId: tenant.id } });
    const sub = await refreshExpiredSubscription(rawSub);
    const plan = sub?.status === "ACTIVE" ? sub.plan : "FREE";
    const isPro = isProOrEnterprisePlan(plan);

    const rows = await db.tenantBranch.findMany({
      where: { tenantId: tenant.id },
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    });

    const branches: TenantBranchDTO[] = rows.map((b) => ({
      id: b.id,
      tenantId: b.tenantId,
      name: b.name,
      nameKm: b.nameKm,
      city: b.city,
      district: b.district,
      address: b.address,
      phone: b.phone,
      telegram: b.telegram,
      isMain: b.isMain,
      status: b.status as "ACTIVE" | "INACTIVE",
      openingHours: b.openingHours,
      imageUrl: b.imageUrl,
      vehicleCount: b._count.vehicles,
      createdAt: b.createdAt.toISOString(),
    }));

    const canAddMore = isPro;

    return NextResponse.json({
      branches,
      canAddMore,
      plan,
      isPro,
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/branches GET", "Failed to load branches");
  }
}

export async function POST(req: Request) {
  try {
    const { member, tenant } = await requireTenantMember();

    if (member.role !== "OWNER" && member.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Only dealership owners or managers can add branches" },
        { status: 403 },
      );
    }

    await assertBranchCreationAllowed(tenant.id);

    const json = await req.json();
    const parsed = branchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid branch data", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Check if this is the first branch
    const existingCount = await db.tenantBranch.count({ where: { tenantId: tenant.id } });
    const isMain = existingCount === 0 ? true : data.isMain;

    if (isMain) {
      // Unset previous main branch
      await db.tenantBranch.updateMany({
        where: { tenantId: tenant.id },
        data: { isMain: false },
      });
    }

    const created = await db.tenantBranch.create({
      data: {
        tenantId: tenant.id,
        name: data.name,
        nameKm: data.nameKm,
        city: data.city,
        district: data.district,
        address: data.address,
        phone: data.phone,
        telegram: data.telegram,
        isMain,
        status: data.status,
        openingHours: data.openingHours,
        imageUrl: data.imageUrl,
      },
    });

    const dto: TenantBranchDTO = {
      id: created.id,
      tenantId: created.tenantId,
      name: created.name,
      nameKm: created.nameKm,
      city: created.city,
      district: created.district,
      address: created.address,
      phone: created.phone,
      telegram: created.telegram,
      isMain: created.isMain,
      status: created.status as "ACTIVE" | "INACTIVE",
      openingHours: created.openingHours,
      imageUrl: created.imageUrl,
      vehicleCount: 0,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ branch: dto }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/branches POST", "Failed to create branch");
  }
}
