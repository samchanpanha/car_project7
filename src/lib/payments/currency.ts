// Currency helpers shared by the payment UI and the server-side payment engine.
// The USD price is canonical; KHR is derived from the admin-configured rate so
// the amount shown in the checkout matches the amount checked by the server.

export const DEFAULT_KHR_PER_USD = 4100;
export const DEFAULT_KHR_ROUNDING = 100;
export const DEFAULT_USD_TOLERANCE = 0.5;
export const DEFAULT_KHR_TOLERANCE = 500;

export type PaymentCurrency = "USD" | "KHR";

export function clampKhrRate(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_KHR_PER_USD;
  return Math.min(20_000, Math.max(1000, Math.round(n * 100) / 100));
}

export function clampRounding(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : DEFAULT_KHR_ROUNDING;
  return [1, 10, 100, 1000].includes(n) ? n : DEFAULT_KHR_ROUNDING;
}

/** Convert a USD price to the exact KHR amount used for checkout. */
export function usdToKhr(
  usd: number,
  rate = DEFAULT_KHR_PER_USD,
  rounding = DEFAULT_KHR_ROUNDING,
): number {
  const safeUsd = Number.isFinite(usd) ? Math.max(0, usd) : 0;
  const safeRate = clampKhrRate(rate);
  const step = clampRounding(rounding);
  return Math.round((safeUsd * safeRate) / step) * step;
}

/** Exact KHR amount with thousands separators, e.g. ៛200,900. */
export function formatKhrExact(value: number): string {
  return `៛${Math.round(value).toLocaleString("en-US")}`;
}

/** Display amount for a payment in its selected currency. */
export function formatPaymentAmount(currency: PaymentCurrency | string, amount: number): string {
  return currency === "KHR" ? formatKhrExact(amount) : `$${amount.toFixed(2)}`;
}

/** Expected amount in the selected currency for a USD-priced plan. */
export function expectedAmountFor(
  priceUsd: number,
  currency: PaymentCurrency,
  rate = DEFAULT_KHR_PER_USD,
  rounding = DEFAULT_KHR_ROUNDING,
): number {
  return currency === "KHR" ? usdToKhr(priceUsd, rate, rounding) : Math.round(priceUsd * 100) / 100;
}

/** Tolerance for the selected currency. */
export function toleranceFor(
  currency: PaymentCurrency,
  usdTolerance = DEFAULT_USD_TOLERANCE,
  khrTolerance = DEFAULT_KHR_TOLERANCE,
): number {
  return currency === "KHR" ? Math.max(0, khrTolerance) : Math.max(0, usdTolerance);
}
