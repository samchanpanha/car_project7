// Admin-configurable plan catalog — the Super Admin owns pricing, limits and
// availability for every paid plan. Values live in the PlatformSetting
// "payments.planConfig" row and are merged over the code-level defaults so a
// missing/partial config can never break subscription flows.
//
// The FREE plan keeps its own config (payments.manualConfig.freePlan) because
// it is a usage tier, not a purchasable product.

import { db } from "@/lib/db";
import { PLAN_CATALOG, type PlanKey } from "@/lib/api/plans";
import type { PlanDTO } from "@/lib/dashboard-types";

export type PaidPlanKey = Exclude<PlanKey, "FREE">;

export interface PlanPriceCfg {
  priceUsdMonthly: number;
  priceUsdYearly: number;
  priceKhrMonthly?: number;
  priceKhrYearly?: number;
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
  /** when false the plan cannot list spare parts (cars/motors only) */
  canSellSpareParts?: boolean;
  /** when false the plan is hidden from sellers and cannot be purchased */
  enabled: boolean;
}

export type PlanPricingConfig = Record<PaidPlanKey, PlanPriceCfg>;

/** Shape of the free-tier config, mirrored structurally from payments.ts. */
interface FreePlanOverrides {
  enabled?: boolean;
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
}

export const PAID_PLAN_KEYS: PaidPlanKey[] = ["BASIC", "PRO", "ENTERPRISE"];

const PRICING_KEY = "payments.planConfig";

function clampLimit(n: unknown, fallback: number, min = 0, max = 9999): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.min(max, Math.max(min, v));
}

function clampPrice(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
  return Math.min(99999, Math.max(0, v));
}

function clampKhrPrice(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(999_999_999, Math.max(0, v));
}

/** Code-level defaults — derived once from the canonical catalog with standard 4100 KHR rate. */
function defaultPricing(): PlanPricingConfig {
  const out = {} as PlanPricingConfig;
  for (const key of PAID_PLAN_KEYS) {
    const row = PLAN_CATALOG.find((p) => p.plan === key)!;
    const defaultKhrMonthly = Math.round((row.priceUsdMonthly * 4100) / 100) * 100;
    const defaultKhrYearly = Math.round((row.priceUsdYearly * 4100) / 100) * 100;
    out[key] = {
      priceUsdMonthly: row.priceUsdMonthly,
      priceUsdYearly: row.priceUsdYearly,
      priceKhrMonthly: defaultKhrMonthly,
      priceKhrYearly: defaultKhrYearly,
      listingsLimit: row.listingsLimit,
      featuredLimit: row.featuredLimit,
      seats: row.seats,
      canSellSpareParts: row.canSellSpareParts ?? (key === "PRO" || key === "ENTERPRISE"),
      enabled: true,
    };
  }
  return out;
}

/** Merged pricing config (stored admin values over defaults). Never throws. */
export async function getPlanPricing(): Promise<PlanPricingConfig> {
  const defaults = defaultPricing();
  try {
    const row = await db.platformSetting.findUnique({ where: { key: PRICING_KEY } });
    if (!row) return defaults;
    const parsed = JSON.parse(row.valueJson) as Partial<PlanPricingConfig>;
    for (const key of PAID_PLAN_KEYS) {
      const p = parsed[key];
      if (!p) continue;
      const d = defaults[key];
      const fallbackKhrM = Math.round((p.priceUsdMonthly ?? d.priceUsdMonthly) * 4100 / 100) * 100;
      const fallbackKhrY = Math.round((p.priceUsdYearly ?? d.priceUsdYearly) * 4100 / 100) * 100;
      defaults[key] = {
        priceUsdMonthly: clampPrice(p.priceUsdMonthly, d.priceUsdMonthly),
        priceUsdYearly: clampPrice(p.priceUsdYearly, d.priceUsdYearly),
        priceKhrMonthly: clampKhrPrice(p.priceKhrMonthly, fallbackKhrM),
        priceKhrYearly: clampKhrPrice(p.priceKhrYearly, fallbackKhrY),
        listingsLimit: clampLimit(p.listingsLimit, d.listingsLimit),
        featuredLimit: clampLimit(p.featuredLimit, d.featuredLimit),
        seats: clampLimit(p.seats, d.seats, 1),
        canSellSpareParts: typeof p.canSellSpareParts === "boolean" ? p.canSellSpareParts : d.canSellSpareParts,
        enabled: typeof p.enabled === "boolean" ? p.enabled : d.enabled,
      };
    }
    return defaults;
  } catch {
    return defaults;
  }
}

/** Persist the admin's plan configuration (audited) and propagate the new
 *  limits to every existing ACTIVE subscription on each plan — same contract
 *  the free-tier config already follows, so admin limit changes apply live. */
export async function savePlanPricing(cfg: PlanPricingConfig, actorId: string): Promise<void> {
  const valueJson = JSON.stringify(cfg);
  await db.platformSetting.upsert({
    where: { key: PRICING_KEY },
    create: { key: PRICING_KEY, valueJson },
    update: { valueJson },
  });
  for (const key of PAID_PLAN_KEYS) {
    await db.subscription.updateMany({
      where: { plan: key },
      data: {
        listingsLimit: cfg[key].listingsLimit,
        featuredLimit: cfg[key].featuredLimit,
        seats: cfg[key].seats,
      },
    });
  }
  await db.auditLog.create({
    data: {
      actorId,
      action: "PLAN_CONFIG_UPDATED",
      entity: "PlatformSetting",
      entityId: PRICING_KEY,
      metaJson: JSON.stringify(
        Object.fromEntries(
          PAID_PLAN_KEYS.map((k) => [
            k,
            {
              ...cfg[k],
              priceUsdMonthly: cfg[k].priceUsdMonthly,
              priceKhrMonthly: cfg[k].priceKhrMonthly,
            },
          ]),
        ),
      ),
    },
  });
}

/**
 * The seller-facing plan catalog: admin-configured numbers merged over the
 * canonical rows (names & feature copy stay code-owned). Disabled paid plans
 * are filtered out unless `includeDisabled` (admin screens want the full list).
 */
export async function getPlanCatalog(opts?: {
  includeDisabled?: boolean;
  freePlan?: FreePlanOverrides;
}): Promise<PlanDTO[]> {
  const pricing = await getPlanPricing();
  const rows: PlanDTO[] = PLAN_CATALOG.map((p) => {
    if (p.plan === "FREE") {
      return opts?.freePlan
        ? {
            ...p,
            priceKhrMonthly: 0,
            priceKhrYearly: 0,
            listingsLimit: opts.freePlan.listingsLimit,
            featuredLimit: opts.freePlan.featuredLimit,
            seats: opts.freePlan.seats,
          }
        : { ...p, priceKhrMonthly: 0, priceKhrYearly: 0 };
    }
    const cfg = pricing[p.plan as PaidPlanKey];
    return {
      ...p,
      priceUsdMonthly: cfg.priceUsdMonthly,
      priceUsdYearly: cfg.priceUsdYearly,
      priceKhrMonthly: cfg.priceKhrMonthly || Math.round((cfg.priceUsdMonthly * 4100) / 100) * 100,
      priceKhrYearly: cfg.priceKhrYearly || Math.round((cfg.priceUsdYearly * 4100) / 100) * 100,
      listingsLimit: cfg.listingsLimit,
      featuredLimit: cfg.featuredLimit,
      seats: cfg.seats,
      canSellSpareParts: cfg.canSellSpareParts ?? p.canSellSpareParts ?? false,
    };
  });
  if (opts?.includeDisabled) return rows;
  return rows.filter((p) => {
    if (p.plan === "FREE") {
      return opts?.freePlan ? opts.freePlan.enabled : true;
    }
    return pricing[p.plan as PaidPlanKey].enabled;
  });
}

/** Price for a configured plan/cycle and currency (USD or KHR). */
export function priceForCfg(
  cfg: PlanPriceCfg,
  cycle: "MONTHLY" | "YEARLY",
  currency: "USD" | "KHR" = "USD",
  khrRate = 4100,
): number {
  if (currency === "KHR") {
    if (cycle === "YEARLY") {
      return cfg.priceKhrYearly && cfg.priceKhrYearly > 0
        ? cfg.priceKhrYearly
        : Math.round((cfg.priceUsdYearly * khrRate) / 100) * 100;
    }
    return cfg.priceKhrMonthly && cfg.priceKhrMonthly > 0
      ? cfg.priceKhrMonthly
      : Math.round((cfg.priceUsdMonthly * khrRate) / 100) * 100;
  }
  return cycle === "YEARLY" ? cfg.priceUsdYearly : cfg.priceUsdMonthly;
}
