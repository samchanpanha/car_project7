"use client";

import { useAppStore } from "@/lib/store";
import { translate, type DictKey } from "@/lib/i18n";

/** Returns a translate function bound to the current locale. */
export function useT() {
  const locale = useAppStore((s) => s.locale);
  return (key: DictKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
