// Shared platform-settings reader — the admin settings route and other
// server code (e.g. the seller free-trial computation) both read from the
// key-value PlatformSetting table through this helper so defaults and
// parsing stay in one place.
import { db } from "@/lib/db";
import type { PlatformSettingsDTO } from "@/lib/dashboard-types";

export const SETTING_KEYS = [
  "commissionPct",
  "featuredListingPriceUsd",
  "autoApproveListings",
  "maintenanceMode",
  "freeTrialDays",
  "freeTrialEnabled",
  "demoModeEnabled",
  "adminOnlyLogin",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const DEFAULT_SETTINGS: PlatformSettingsDTO = {
  commissionPct: 2.5,
  featuredListingPriceUsd: 25,
  autoApproveListings: false,
  maintenanceMode: false,
  /** whether free trial for new sellers/dealers is active or inactive */
  freeTrialEnabled: true,
  /** free trial for newly registered sellers/dealers — 1 month by default */
  freeTrialDays: 30,
  /** whether demo persona display and sandbox mode is active (default false) */
  demoModeEnabled: false,
  /** whether platform login is restricted to administrators only (default true) */
  adminOnlyLogin: true,
};

/** Read all platform settings with defaults for missing/malformed keys. */
export async function readPlatformSettings(): Promise<PlatformSettingsDTO> {
  const rows = await db.platformSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  const settings: PlatformSettingsDTO = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    const raw = byKey.get(key);
    if (raw == null) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed != null) {
        (settings as Record<SettingKey, unknown>)[key] = parsed;
      }
    } catch {
      // Malformed stored value — keep default.
    }
  }
  return settings;
}

/** Trial window for a non-paying seller/dealer account:
 *  registration date → registration date + freeTrialDays.
 *  If freeTrialEnabled is false or freeTrialDays <= 0, trial is immediately expired / inactive. */
export function sellerTrialWindow(
  createdAt: Date,
  freeTrialDays: number,
  freeTrialEnabled: boolean = true,
): { startedAt: Date; currentPeriodEnd: Date; daysLeft: number; expired: boolean; enabled: boolean } {
  if (!freeTrialEnabled || freeTrialDays <= 0) {
    return {
      startedAt: createdAt,
      currentPeriodEnd: createdAt,
      daysLeft: 0,
      expired: true,
      enabled: false,
    };
  }
  const startedAt = createdAt;
  const currentPeriodEnd = new Date(createdAt.getTime() + freeTrialDays * 24 * 60 * 60 * 1000);
  const msLeft = currentPeriodEnd.getTime() - Date.now();
  const daysLeft = msLeft <= 0 ? 0 : Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  return { startedAt, currentPeriodEnd, daysLeft, expired: msLeft <= 0, enabled: true };
}
