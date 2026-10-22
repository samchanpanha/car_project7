import { NextResponse } from "next/server";
import { readPlatformSettings } from "@/lib/platform-settings";
import { getPlanPricing } from "@/lib/api/plan-config";
import { PLAN_CATALOG } from "@/lib/api/plans";

export const dynamic = "force-dynamic";

/**
 * Public platform settings endpoint:
 * Allows registration flow and guest view to know if Free Trial is active or inactive,
 * and view available subscription plans and pricing.
 */
export async function GET() {
  try {
    const [settings, pricing] = await Promise.all([
      readPlatformSettings(),
      getPlanPricing(),
    ]);

    // Merge custom pricing over canonical plan catalog
    const plans = PLAN_CATALOG.map((p) => {
      if (p.plan === "FREE") return p;
      const custom = pricing[p.plan as "BASIC" | "PRO" | "ENTERPRISE"];
      if (!custom) return p;
      return {
        ...p,
        priceUsdMonthly: custom.priceUsdMonthly,
        priceUsdYearly: custom.priceUsdYearly,
        listingsLimit: custom.listingsLimit,
        featuredLimit: custom.featuredLimit,
        seats: custom.seats,
        enabled: custom.enabled,
      };
    }).filter((p) => (p.plan === "FREE" ? true : (p as any).enabled !== false));

    return NextResponse.json({
      freeTrialEnabled: settings.freeTrialEnabled,
      freeTrialDays: settings.freeTrialDays,
      maintenanceMode: settings.maintenanceMode,
      plans,
    });
  } catch (err) {
    console.error("[api/platform-settings] error:", err);
    return NextResponse.json(
      {
        freeTrialEnabled: true,
        freeTrialDays: 30,
        maintenanceMode: false,
        plans: PLAN_CATALOG,
      },
      { status: 200 },
    );
  }
}
