/**
 * Flexible Pricing Engine for KhLan Vehicle Marketplace.
 *
 * Rules:
 * - base_price is vehicle.priceUsd.
 * - configurable price_types (code, label, mode FIXED|PERCENT, badge_color, priority, stackable, active).
 * - item_prices have start/end dates, currency, and active status.
 * - effective price = highest-priority active price within valid date range, else base price.
 * - floor price enforcement: if promotional price is below floor_price_usd, effective price clamps to floor_price_usd.
 * - filters and search queries evaluate against effective price.
 */

export type PriceMode = "FIXED" | "PERCENT";

export interface PriceTypeConfig {
  id?: string;
  code: string;
  label: string;
  mode: PriceMode | string;
  badgeColor: string;
  priority: number;
  stackable?: boolean;
  active: boolean;
}

export interface ItemPriceRecord {
  id?: string;
  vehicleId?: string;
  priceTypeId?: string;
  priceType?: PriceTypeConfig | null;
  value: number;
  currency?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  active?: boolean;
}

export interface VehiclePricingContext {
  id?: string;
  priceUsd: number; // base price
  floorPriceUsd?: number | null;
  itemPrices?: ItemPriceRecord[];
}

export interface EffectivePriceResult {
  basePriceUsd: number;
  effectivePriceUsd: number;
  discountUsd: number;
  discountPercent: number;
  isOnSale: boolean;
  activePriceType: PriceTypeConfig | null;
  activeItemPrice: ItemPriceRecord | null;
  floorPriceUsd: number | null;
  floorEnforced: boolean;
  savingsBadgeText?: string;
}

/** Check whether an item price is currently active based on date range & active flags. */
export function isItemPriceActive(
  itemPrice: ItemPriceRecord,
  referenceDate: Date = new Date(),
): boolean {
  if (itemPrice.active === false) return false;
  if (itemPrice.priceType && itemPrice.priceType.active === false) return false;

  const nowTime = referenceDate.getTime();

  if (itemPrice.startDate) {
    const startTime = new Date(itemPrice.startDate).getTime();
    if (!Number.isNaN(startTime) && nowTime < startTime) return false;
  }

  if (itemPrice.endDate) {
    const endTime = new Date(itemPrice.endDate).getTime();
    if (!Number.isNaN(endTime) && nowTime > endTime) return false;
  }

  return true;
}

/**
 * Calculates the promotional price candidate for a given base price and item price rule.
 * - If mode is PERCENT: candidate = basePrice * (1 - value / 100)
 * - If mode is FIXED:
 *     If value < basePrice: candidate = value (direct promo price e.g. $18,500)
 *     If value >= basePrice: candidate = basePrice (no markup promo)
 */
export function calculateCandidatePrice(
  basePrice: number,
  itemPrice: ItemPriceRecord,
): number {
  const mode = (itemPrice.priceType?.mode || "FIXED").toUpperCase();
  const value = Number(itemPrice.value);

  if (Number.isNaN(value) || value <= 0) return basePrice;

  if (mode === "PERCENT") {
    const clampedPercent = Math.min(Math.max(value, 0), 100);
    return Math.round(basePrice * (1 - clampedPercent / 100));
  }

  // FIXED mode
  if (value < basePrice) {
    return Math.round(value);
  }

  return basePrice;
}

/**
 * Resolves the effective price for a vehicle given its base price, floor price, and active item_prices.
 */
export function resolveEffectivePrice(
  vehicle: VehiclePricingContext,
  referenceDate: Date = new Date(),
): EffectivePriceResult {
  const basePrice = Math.max(0, Number(vehicle.priceUsd) || 0);
  const floorPrice = vehicle.floorPriceUsd != null && vehicle.floorPriceUsd > 0
    ? Number(vehicle.floorPriceUsd)
    : null;

  const itemPrices = vehicle.itemPrices ?? [];

  // Filter to currently active item prices
  const activePrices = itemPrices.filter((ip) => isItemPriceActive(ip, referenceDate));

  if (activePrices.length === 0) {
    return {
      basePriceUsd: basePrice,
      effectivePriceUsd: basePrice,
      discountUsd: 0,
      discountPercent: 0,
      isOnSale: false,
      activePriceType: null,
      activeItemPrice: null,
      floorPriceUsd: floorPrice,
      floorEnforced: false,
    };
  }

  // Sort by price type priority descending (higher priority wins)
  const sorted = [...activePrices].sort((a, b) => {
    const prioA = a.priceType?.priority ?? 0;
    const prioB = b.priceType?.priority ?? 0;
    return prioB - prioA;
  });

  const winner = sorted[0];
  const candidate = calculateCandidatePrice(basePrice, winner);

  let effective = candidate;
  let floorEnforced = false;

  // Enforce floor price
  if (floorPrice != null && effective < floorPrice) {
    effective = floorPrice;
    floorEnforced = true;
  }

  const discountUsd = Math.max(0, basePrice - effective);
  const discountPercent = basePrice > 0 ? Math.round((discountUsd / basePrice) * 100) : 0;
  const isOnSale = discountUsd > 0;

  let savingsBadgeText: string | undefined;
  if (isOnSale) {
    savingsBadgeText = discountPercent > 0
      ? `-${discountPercent}%`
      : `Save $${discountUsd.toLocaleString()}`;
  }

  return {
    basePriceUsd: basePrice,
    effectivePriceUsd: effective,
    discountUsd,
    discountPercent,
    isOnSale,
    activePriceType: winner.priceType ?? null,
    activeItemPrice: winner,
    floorPriceUsd: floorPrice,
    floorEnforced,
    savingsBadgeText,
  };
}

