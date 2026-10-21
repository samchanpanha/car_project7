import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { toPurchaseDTO } from "@/lib/api/purchases";
import type { PurchaseRequestDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Purchase requests on this tenant's listings (dealer dashboard). */
export async function GET() {
  try {
    const { tenant } = await requireTenantMember();
    const rows = await db.purchaseRequest.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, images: { select: { url: true, sortOrder: true } } } },
        buyer: { select: { id: true, name: true } },
      },
    });
    const items: PurchaseRequestDTO[] = rows.map((r) =>
      toPurchaseDTO(r, tenant.name),
    );
    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/purchase-requests GET", "Failed to load purchase requests");
  }
}
