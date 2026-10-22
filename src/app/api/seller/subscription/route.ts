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
    const trial = sellerTrialWindow(user.createdAt, settings.freeTrialDays, settings.freeTrialEnabled);

    // Also check if they have a real paid subscription in their tenant:
    const membership = await db.tenantMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      include: { tenant: { include: { subscription: true } } },
    });
    const realSub = membership?.tenant?.subscription;
    const isPaidActive = realSub && realSub.status === "ACTIVE" && realSub.plan !== "FREE";

    const dto: SellerSubscriptionDTO = {
      plan: isPaidActive ? realSub.plan : "FREE_TRIAL",
      status: isPaidActive
        ? "ACTIVE"
        : trial.enabled && !trial.expired
        ? "ACTIVE"
        : trial.enabled
        ? "EXPIRED"
        : "INACTIVE",
      startedAt: isPaidActive ? realSub.startedAt.toISOString() : trial.startedAt.toISOString(),
      currentPeriodEnd: isPaidActive ? realSub.currentPeriodEnd.toISOString() : trial.currentPeriodEnd.toISOString(),
      daysLeft: isPaidActive ? 30 : trial.daysLeft,
      freeTrialDays: settings.freeTrialDays,
      freeTrialEnabled: settings.freeTrialEnabled,
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/seller/subscription GET", "Failed to load subscription");
  }
}
