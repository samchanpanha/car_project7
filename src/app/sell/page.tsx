import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { absoluteUrl } from "@/lib/seo";

/** Rendered per request so the canonical URL and OG tags always reflect the
 *  runtime `SITE_URL` — a statically prerendered page would freeze the domain
 *  that was configured at build time. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sell Your Car or Motorbike in Cambodia — Free Listing",
  description:
    "List your car, motorbike or spare parts on KhLan for free. Add photos, set your price in USD or KHR, reach verified buyers across Cambodia and manage offers from your dashboard.",
  alternates: { canonical: absoluteUrl("/sell") },
  openGraph: {
    type: "website",
    title: "Sell Your Car or Motorbike in Cambodia — Free Listing",
    description:
      "Reach verified buyers across Cambodia. Free listings, AI-assisted pricing context and secure in-app messaging.",
    url: absoluteUrl("/sell"),
  },
};

export default function SellPage() {
  return <AppChrome initialView={{ name: "sell" }} />;
}
