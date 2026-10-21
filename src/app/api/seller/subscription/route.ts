import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import { toErrorResponse, HttpError } from "@/lib/api/guards";
import { readPlatformSettings, sellerTrialWindow } from "@/lib/platform-settings";
import type { SellerSubscriptionDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/seller/subscription — the virtual subscription shown to
 * non-tenant SELLER / DEALER accounts. New registrations get a FREE trial
 * automatically: registration date + the admin-configured `freeTrialDays`
 * platform setting (default 30 days). No Subscription row is stored — the
 * trial is computed so an admin change to the setting applies immediately.
 */
export async function GET() {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (user.role !== "SELLER" && user.role !== "DEALER") {
      throw new HttpError(403, "Only seller and dealer accounts have a selling subscription");
    }

    const settings = await readPlatformSettings();
    const trial = sellerTrialWindow(user.createdAt, settings.freeTrialDays);

    const dto: SellerSubscriptionDTO = {
      plan: "FREE_TRIAL",
      status: trial.expired ? "EXPIRED" : "ACTIVE",
      startedAt: trial.startedAt.toISOString(),
      currentPeriodEnd: trial.currentPeriodEnd.toISOString(),
      daysLeft: trial.daysLeft,
      freeTrialDays: settings.freeTrialDays,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/seller/subscription GET", "Failed to load subscription");
  }
}
