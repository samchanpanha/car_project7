import type { Locale } from "./i18n";

const KHR_PER_USD = 4100; // indicative demo rate (see PLAN.md §2 — validate at launch)

export function formatUsd(value: number | null | undefined): string {
  const v = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
  if (locale === "km") return `${n} គ.ម`;
  if (locale === "zh") return `${n} 公里`;
  return `${n} km`;
}

export function timeAgo(iso: string, locale: Locale): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: Array<[number, Record<Locale, string>]> = [
    [31536000, { en: "y", km: "ឆ្នាំ", zh: "年", vi: "năm" }],
    [2592000, { en: "mo", km: "ខែ", zh: "个月", vi: "tháng" }],
    [604800, { en: "w", km: "សប្តាហ៍", zh: "周", vi: "tuần" }],
    [86400, { en: "d", km: "ថ្ងៃ", zh: "天", vi: "ngày" }],
    [3600, { en: "h", km: "ម៉ោង", zh: "小时", vi: "giờ" }],
    [60, { en: "m", km: "នាទី", zh: "分钟", vi: "phút" }],
  ];
  for (const [secs, label] of units) {
    if (seconds >= secs) {
      const v = Math.floor(seconds / secs);
      if (locale === "km") return `${v} ${label.km}មុន`;
      if (locale === "zh") return `${v}${label.zh}前`;
      if (locale === "vi") return `${v} ${label.vi} trước`;
      return `${v}${label.en} ago`;
    }
  }
  if (locale === "km") return "ទីនេះ";
  if (locale === "zh") return "刚刚";
  if (locale === "vi") return "vừa xong";
  return "just now";
}

export function formatYear(y: number): string {
  return String(y);
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
