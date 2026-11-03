import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { pathToView, toQueryString } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Rendered per request so the canonical URL always reflects the runtime
 *  `SITE_URL` (a prerendered page would freeze the build-time domain). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buying & Selling Guide",
  description:
    "Step-by-step guides for buying and selling cars and motorbikes in Cambodia: how to inspect a listing, verify documents, negotiate safely, and pay with ABA or KhQR.",
  alternates: { canonical: absoluteUrl("/guide") },
  openGraph: {
    type: "article",
    title: "Buying & Selling Guide — KhLan",
    description:
      "How to buy and sell cars, motorbikes and spare parts safely in Cambodia — inspections, documents, payments and delivery.",
    url: absoluteUrl("/guide"),
  },
};

export default async function GuidePage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQueryString(await searchParams);
  return <AppChrome initialView={pathToView("/guide", query)} />;
}
