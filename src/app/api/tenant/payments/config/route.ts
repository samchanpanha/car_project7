import { NextResponse } from "next/server";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { khqrDataUrl, getManualPaymentConfig } from "@/lib/api/payments";
import type { PaymentConfigDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Payment options available to the seller — QR is rendered server-side. */
export async function GET() {
  try {
    const config = await getManualPaymentConfig();
    const dto: PaymentConfigDTO = {
      enabled: config.enabled,
      manual: {
        accountName: config.accountName,
        instructionsEn: config.instructionsEn,
        instructionsKm: config.instructionsKm,
        telegram: config.telegram,
        hasKhqr: Boolean(config.khqrImage || config.khqrPayload || config.khqrImageUrl || config.khqrImageMonthly || config.khqrImageYearly),
        khqrDataUrl: await khqrDataUrl(config),
        khqrImage: config.khqrImage,
        // Per-cycle KHQR images — fall back to static placeholders
        khqrImageMonthly: config.khqrImageMonthly || "/khqr/khqr-monthly.jpg",
        khqrImageYearly: config.khqrImageYearly || "/khqr/khqr-yearly.jpg",
      },
      freePlan: config.freePlan,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/config GET", "Failed to load payment config");
  }
}
