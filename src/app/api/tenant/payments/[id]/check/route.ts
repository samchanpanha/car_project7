import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { verifyPaymentAndActivate, toPaymentErrorResponse } from "@/lib/api/payments";
import { checkTransactionByMd5 } from "@/lib/bakong";

export const dynamic = "force-dynamic";

/**
 * Bakong payment status check — called by the seller while their QR is open.
 * Verification is SERVER-SIDE ONLY: the response of check_transaction_by_md5
 * decides, never the client. When paid, the subscription is activated/extended
 * through the same guarded path as manual admin approval.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { member } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const payment = await db.subscriptionPayment.findUnique({ where: { id } });
    if (!payment || payment.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json({ status: payment.status });
    }
    if (!payment.bakongMd5) {
      return NextResponse.json({ error: "Payment has no Bakong reference" }, { status: 400 });
    }

    const check = await checkTransactionByMd5(payment.bakongMd5);
    if (!check.paid) {
      return NextResponse.json({ status: "PENDING", paid: false });
    }

    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: { bakongHash: check.hash ?? null },
    });

    const subscription = await verifyPaymentAndActivate(
      { ...payment, bakongHash: check.hash ?? null },
      member.userId,
    );
    return NextResponse.json({ status: "VERIFIED", paid: true, subscription });
  } catch (err) {
    return toPaymentErrorResponse(err, "api/tenant/payments/[id]/check POST");
  }
}
