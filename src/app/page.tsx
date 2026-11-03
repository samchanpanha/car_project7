import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/seo";

/** Rendered per request so the canonical URL and OG tags always reflect the
 *  runtime `SITE_URL` — a statically prerendered page would freeze the domain
 *  that was configured at build time. */
export const dynamic = "force-dynamic";

const OG_IMAGE = {
  url: "/og/khlan-cover.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${SITE_NAME} — Cambodia's trusted car marketplace`,
};

export const metadata: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    type: "website",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

export default function Page() {
  return <AppChrome initialView={{ name: "home" }} />;
}
