import { en } from "./locales/en";
import { km } from "./locales/km";
import { zh } from "./locales/zh";
import { vi } from "./locales/vi";
import type { Locale } from "./types";

export * from "./types";
export * from "./labels";
export { en, km, zh, vi };

export const dictionaries = { en, km, zh, vi };
export type DictKey = keyof typeof en;

export function translate(locale: Locale, key: DictKey, vars?: Record<string, string | number>): string {
  let text: string = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
