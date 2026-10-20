import type { Locale } from "./i18n";

const KHR_PER_USD = 4100; // indicative demo rate (see PLAN.md §2 — validate at launch)

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatKhr(usd: number): string {
  const riel = Math.round((usd * KHR_PER_USD) / 100000) * 100000;
  if (riel >= 1_000_000) {
    const m = riel / 1_000_000;
    return `៛${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `៛${riel.toLocaleString("en-US")}`;
}

export function formatMileage(km: number, locale: Locale): string {
  const n = km.toLocaleString("en-US");
  return locale === "km" ? `${n} គ.ម` : `${n} km`;
}

export function timeAgo(iso: string, locale: Locale): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: Array<[number, { en: string; km: string }]> = [
    [31536000, { en: "y", km: "ឆ្នាំ" }],
    [2592000, { en: "mo", km: "ខែ" }],
    [604800, { en: "w", km: "សប្តាហ៍" }],
    [86400, { en: "d", km: "ថ្ងៃ" }],
    [3600, { en: "h", km: "ម៉ោង" }],
    [60, { en: "m", km: "នាទី" }],
  ];
  for (const [secs, label] of units) {
    if (seconds >= secs) {
      const v = Math.floor(seconds / secs);
      return locale === "km" ? `${v} ${label.km}មុន` : `${v}${label.en} ago`;
    }
  }
  return locale === "km" ? "ទីនេះ" : "just now";
}

export function formatYear(y: number): string {
  return String(y);
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
