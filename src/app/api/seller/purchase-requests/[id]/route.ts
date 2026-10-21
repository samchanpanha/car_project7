import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { purchaseErrorResponse, sellerTransition } from "@/lib/api/purchases";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["accept", "reject", "complete", "cancel"]),
});

/** Private seller responds to a purchase request on their own listing. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
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

    const purchase = await db.purchaseRequest.findUnique({
      where: { id },
      include: {
        vehicle: { select: { sellerId: true, tenantId: true } },
        buyer: { select: { id: true, name: true } },
      },
    });
    if (!purchase || purchase.sellerUserId !== user.id || purchase.vehicle.tenantId) {
      return NextResponse.json({ error: "Purchase request not found" }, { status: 404 });
    }

    const updated = await sellerTransition(purchase, parsed.data.action, user.id);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    return purchaseErrorResponse(err, "api/seller/purchase-requests/[id] PATCH");
  }
}
