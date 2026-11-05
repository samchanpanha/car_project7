import { AppChrome } from "@/components/marketplace/app-chrome";
import { pathToView, toQueryString } from "@/lib/routes";
import { getMarketingMetadata } from "@/lib/i18n/marketing-metadata";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return getMarketingMetadata("financing");
}

export default async function FinancingPage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQueryString(await searchParams);
  return <AppChrome initialView={pathToView("/financing", query)} />;
}
