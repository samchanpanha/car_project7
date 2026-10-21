import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import { khqrDataUrl, getManualPaymentConfig } from "@/lib/api/payments";
import { bakongConfigured } from "@/lib/bakong";
import type { PaymentConfigDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Payment options available to the seller — QR is rendered server-side. */
export async function GET() {
  try {
    await requireTenantMember();
    const config = await getManualPaymentConfig();
    const dto: PaymentConfigDTO = {
      bakongConfigured: bakongConfigured(),
      manual: {
        accountName: config.accountName,
        instructionsEn: config.instructionsEn,
        instructionsKm: config.instructionsKm,
        telegram: config.telegram,
        hasKhqr: Boolean(config.khqrPayload || config.khqrImageUrl),
        khqrDataUrl: await khqrDataUrl(config),
      },
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/config GET", "Failed to load payment config");
  }
}
