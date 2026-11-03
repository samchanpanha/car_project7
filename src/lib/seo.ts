/**
 * Central SEO configuration.
 *
 * Server-only module: imported by `app/layout.tsx`, `app/robots.ts`,
 * `app/sitemap.ts` and the metadata-bearing route files. Never import it from
 * a client component — it reads non-public environment variables.
 */

/** Canonical origin used for `metadataBase`, sitemap entries and OG URLs.
 *
 *  Precedence: `SITE_URL` → `NEXTAUTH_URL` → `NEXT_PUBLIC_SITE_URL` → Render.
 *
 *  `SITE_URL` comes first on purpose: `NEXT_PUBLIC_*` variables are inlined
 *  into the bundle at build time, so they would freeze the canonical domain
 *  into statically prerendered pages. Plain `SITE_URL` is read at request
 *  time, which keeps dynamic routes correct when the domain changes.
 */
export const SITE_URL = (
  process.env.SITE_URL ||
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://khlan-marketplace.onrender.com"
).replace(/\/+$/, "");

export const SITE_NAME = "KhLan ឡាន";

export const SITE_DOMAIN = SITE_URL.replace(/^https?:\/\//, "");

export const DEFAULT_TITLE = `${SITE_NAME} — Cambodia's Trusted Car Marketplace`;

export const DEFAULT_DESCRIPTION =
  "Buy and sell cars in Cambodia with confidence: verified listings, evidence-based AI vehicle reports, secure messaging. Khmer & English.";

export const DEFAULT_KEYWORDS = [
  "Cambodia",
  "car marketplace",
  "used cars",
  "buy car Cambodia",
  "sell car Cambodia",
  "Phnom Penh cars",
  "ឡាន",
  "ខ្មែរ",
  "AI vehicle report",
];

/** Backend base URL — mirrors next.config.ts rewrite target. */
export const BACKEND_URL =
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "http://backend:8080");

/** Absolute URL for a site path ("/browse" → "https://…/browse"). */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Public listing detail URL. */
export { vehiclePath } from "./routes";

export function vehicleUrl(id: string): string {
  return absoluteUrl(`/vehicles/${encodeURIComponent(id)}`);
}/** Locales exposed by the client-side language switcher (`src/lib/i18n`). */
export const OG_LOCALES = ["en_US", "km_KH", "zh_CN", "vi_VN"] as const;

/** Optional search-engine verification tokens (set in the deploy env). */
export const VERIFICATION = {
  google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  other: {
    ...(process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : {}),
  },
} as const;
