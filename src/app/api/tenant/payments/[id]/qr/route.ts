import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

/** Render the KHQR payload of the tenant's own payment as a PNG data URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { member } = await requireTenantMember();
    const { id } = await params;

    const payment = await db.subscriptionPayment.findUnique({
      where: { id },
      select: { tenantId: true, qrPayload: true },
    });
    if (!payment || payment.tenantId !== member.tenantId || !payment.qrPayload) {
      return NextResponse.json({ error: "QR not available" }, { status: 404 });
    }
    const dataUrl = await QRCode.toDataURL(payment.qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    return NextResponse.json({ dataUrl });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/[id]/qr GET", "Failed to render QR");
  }
}
