import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { getManualPaymentConfig } from "@/lib/api/payments";

export const dynamic = "force-dynamic";

/** Admin preview of the configured KHQR payload rendered as a PNG data URL. */
export async function GET() {
  try {
    await requireAdmin();
    const config = await getManualPaymentConfig();
    if (!config.khqrPayload) {
      return NextResponse.json({ dataUrl: null });
    }
    const dataUrl = await QRCode.toDataURL(config.khqrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    });
    return NextResponse.json({ dataUrl });
  } catch (err) {
    return toErrorResponse(err, "api/admin/payment-config/preview GET", "Failed to render preview");
  }
}
