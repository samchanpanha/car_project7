import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { toPurchaseDTO } from "@/lib/api/purchases";
import type { PurchaseRequestDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Purchase requests on listings the current user sells directly (private sellers). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await db.purchaseRequest.findMany({
      where: { sellerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, images: { select: { url: true, sortOrder: true } } } },
        buyer: { select: { id: true, name: true } },
      },
    });
    const items: PurchaseRequestDTO[] = rows.map((r) => toPurchaseDTO(r, user.name));
    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/seller/purchase-requests GET", "Failed to load purchase requests");
  }
}
