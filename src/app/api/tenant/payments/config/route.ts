import { NextResponse } from "next/server";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { khqrDataUrl, getManualPaymentConfig } from "@/lib/api/payments";
import type { PaymentConfigDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Payment options available to the seller — QR is rendered server-side. */
export async function GET() {
  try {
    await requireTenantMember();
    const config = await getManualPaymentConfig();
    const dto: PaymentConfigDTO = {
      enabled: config.enabled,
      manual: {
        accountName: config.accountName,
        instructionsEn: config.instructionsEn,
        instructionsKm: config.instructionsKm,
        telegram: config.telegram,
        hasKhqr: Boolean(config.khqrImage || config.khqrPayload || config.khqrImageUrl),
        khqrDataUrl: await khqrDataUrl(config),
        khqrImage: config.khqrImage,
      },
      freePlan: config.freePlan,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/config GET", "Failed to load payment config");
  }
}
