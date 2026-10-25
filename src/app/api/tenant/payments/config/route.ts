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
        hasKhqr: Boolean(
          config.khqrImage ||
          config.khqrPayload ||
          config.khqrImageUrl ||
          config.khqrImageMonthly ||
          config.khqrImageYearly ||
          config.khqrImageUsd ||
          config.khqrImageKhr ||
          config.khqrImageMonthlyKhr ||
          config.khqrImageYearlyKhr
        ),
        khqrDataUrl: await khqrDataUrl(config),
        khqrImage: config.khqrImage,
        // Per-cycle KHQR images — fall back to static placeholders
        khqrImageMonthly: config.khqrImageMonthly || "/khqr/khqr-monthly.jpg",
        khqrImageYearly: config.khqrImageYearly || "/khqr/khqr-yearly.jpg",
        // Per-currency KHQR images — fallback to cycle or default QR
        khqrImageUsd: config.khqrImageUsd || config.khqrImageMonthly || config.khqrImage || "/khqr/khqr-monthly.jpg",
        khqrImageKhr: config.khqrImageKhr || config.khqrImageYearly || config.khqrImage || "/khqr/khqr-yearly.jpg",
        // Dedicated 2x2 cycle-currency QR codes
        khqrImageMonthlyKhr: config.khqrImageMonthlyKhr || config.khqrImageKhr || config.khqrImageMonthly || "/khqr/khqr-monthly.jpg",
        khqrImageYearlyKhr: config.khqrImageYearlyKhr || config.khqrImageKhr || config.khqrImageYearly || "/khqr/khqr-yearly.jpg",
        khrExchangeRate: config.khrExchangeRate || 4100,
        skipMerchantCheck: config.skipMerchantCheck ?? true,
      },
      freePlan: config.freePlan,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/config GET", "Failed to load payment config");
  }
}
