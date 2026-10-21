import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/** Seller cancels their own open payment request (before verification). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, member } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const payment = await db.subscriptionPayment.findUnique({ where: { id } });
    if (!payment || payment.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (payment.status !== "PENDING" && payment.status !== "AWAITING_VERIFICATION") {
      return NextResponse.json(
        { error: "Only pending payment requests can be cancelled" },
        { status: 409 },
      );
    }

    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED" },
    });
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "PAYMENT_CANCELLED",
        entity: "SubscriptionPayment",
        entityId: payment.id,
        metaJson: JSON.stringify({ reference: payment.reference }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/[id] DELETE", "Failed to cancel payment");
  }
}
