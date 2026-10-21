import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import {
  loadPurchaseForSellerSide,
  purchaseErrorResponse,
  sellerTransition,
} from "@/lib/api/purchases";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["accept", "reject", "complete", "cancel"]),
});

/**
 * Tenant member responds to a purchase request on their listing.
 * OWNER / MANAGER / SALES_STAFF may act — sales staff are the front line for
 * buyer enquiries; inventory permissions are not required.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, member } = await requireTenantMember();
    const allowedRoles = ["OWNER", "MANAGER", "SALES_STAFF"];
    if (!allowedRoles.includes(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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

    const purchase = await loadPurchaseForSellerSide(id);
    if (!purchase || purchase.vehicle.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Purchase request not found" }, { status: 404 });
    }

    const updated = await sellerTransition(purchase, parsed.data.action, user.id);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    return purchaseErrorResponse(err, "api/tenant/purchase-requests/[id] PATCH");
  }
}
