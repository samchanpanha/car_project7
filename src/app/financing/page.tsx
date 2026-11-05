import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { pathToView, toQueryString } from "@/lib/routes";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Vehicle Financing Calculator | ${SITE_NAME}`,
  description:
    "Estimate monthly payments for a pre-owned vehicle loan in Cambodia. KhLan's indicative calculator helps buyers budget before contacting sellers.",
  alternates: { canonical: `${SITE_URL}/financing` },
  openGraph: {
    type: "website",
    title: `Vehicle Financing Calculator | ${SITE_NAME}`,
    description: "Estimate monthly payments for a pre-owned vehicle in Cambodia.",
    url: `${SITE_URL}/financing`,
  },
};

export default async function FinancingPage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQueryString(await searchParams);
  return <AppChrome initialView={pathToView("/financing", query)} />;
}
