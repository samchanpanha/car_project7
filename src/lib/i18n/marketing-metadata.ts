import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { translate } from "./index";
import { isLocale, LOCALE_COOKIE, type Locale } from "./types";

export type MarketingPage = "ev" | "financing" | "trust";

const OPEN_GRAPH_LOCALE: Record<Locale, string> = {
  en: "en_US",
  km: "km_KH",
  zh: "zh_CN",
  vi: "vi_VN",
};

const PAGE_COPY = {
  ev: {
    path: "/ev",
    title: "metaEvTitle",
    description: "metaEvDescription",
  },
  financing: {
    path: "/financing",
    title: "metaFinancingTitle",
    description: "metaFinancingDescription",
  },
  trust: {
    path: "/trust",
    title: "metaTrustTitle",
    description: "metaTrustDescription",
  },
} as const;

export function createMarketingMetadata(locale: Locale, page: MarketingPage): Metadata {
  const copy = PAGE_COPY[page];
  const localizedTitle = translate(locale, copy.title);
  const openGraphTitle = `${localizedTitle} | ${SITE_NAME}`;
  const description = translate(locale, copy.description);
  const url = `${SITE_URL}${copy.path}`;
  const alternateLocales = Object.values(OPEN_GRAPH_LOCALE).filter(
    (value) => value !== OPEN_GRAPH_LOCALE[locale],
  );

  return {
    title: localizedTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: openGraphTitle,
      description,
      url,
      locale: OPEN_GRAPH_LOCALE[locale],
      alternateLocale: alternateLocales,
    },
  };
}

export async function getMarketingMetadata(page: MarketingPage): Promise<Metadata> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : "en";
  return createMarketingMetadata(locale, page);
}
