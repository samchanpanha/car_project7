import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { browseSeo } from "@/lib/browse-seo";
import { pathToView, toQueryString } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const seo = browseSeo(new URLSearchParams(toQueryString(await searchParams)));

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: absoluteUrl(seo.canonical) },
    robots: seo.indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: seo.title,
      description: seo.description,
      url: absoluteUrl(seo.canonical),
    },
  };
}

export default async function BrowsePage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQueryString(await searchParams);
  return <AppChrome initialView={pathToView("/browse", query)} />;
}
