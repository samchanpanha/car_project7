export type Locale = "en" | "km" | "zh" | "vi";

export const LOCALES: readonly Locale[] = ["en", "km", "zh", "vi"];

/** Runtime guard for untrusted locale strings (API payloads, localStorage). */
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "km" || value === "zh" || value === "vi";
}

/** Native language names (shown in the switcher, same in every locale). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  km: "ភាសាខ្មែរ",
  zh: "中文",
  vi: "Tiếng Việt",
};

/** Compact labels for the header toggle trigger. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  km: "ខ្មែរ",
  zh: "中文",
  vi: "VI",
};
