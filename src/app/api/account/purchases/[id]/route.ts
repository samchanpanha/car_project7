import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { loadPurchaseForBuyer, purchaseErrorResponse } from "@/lib/api/purchases";

export const dynamic = "force-dynamic";

/** Buyer cancels their own PENDING purchase request. */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    const purchase = await loadPurchaseForBuyer(id, user.id);
    if (!purchase) {
      return NextResponse.json({ error: "Purchase request not found" }, { status: 404 });
    }
    if (purchase.status !== "PENDING") {
      return NextResponse.json(
        { error: `A ${purchase.status.toLowerCase()} request can no longer be cancelled by the buyer` },
        { status: 409 },
      );
    }

    await db.purchaseRequest.update({
      where: { id: purchase.id },
      data: {
        status: "CANCELLED",
        decidedById: user.id,
        decidedAt: new Date(),
      },
    });
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "PURCHASE_CANCELLED",
        entity: "PurchaseRequest",
        entityId: purchase.id,
        metaJson: JSON.stringify({ vehicleId: purchase.vehicleId, by: "buyer" }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return purchaseErrorResponse(err, "api/account/purchases/[id] PATCH");
  }
}
