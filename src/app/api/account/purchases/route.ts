import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { toPurchaseDTO } from "@/lib/api/purchases";
import type { PurchaseRequestDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Buyer's purchase requests (personal dashboard), newest first. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await db.purchaseRequest.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        vehicle: { select: { id: true, make: true, model: true, year: true, images: { select: { url: true, sortOrder: true } } } },
      },
    });

    const sellerIds = [...new Set(rows.map((r) => r.sellerUserId))];
    const sellers = await db.user.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, name: true },
    });
    const sellerNames = new Map(sellers.map((s) => [s.id, s.name]));

    const items: PurchaseRequestDTO[] = rows.map((r) =>
      toPurchaseDTO(
        { ...r, buyer: null },
        sellerNames.get(r.sellerUserId) ?? "Seller",
      ),
    );
    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/account/purchases GET", "Failed to load purchases");
  }
}
