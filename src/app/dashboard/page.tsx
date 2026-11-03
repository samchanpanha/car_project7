import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { pathToView, toQueryString } from "@/lib/routes";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQueryString(await searchParams);
  return <AppChrome initialView={pathToView("/dashboard", query)} />;
}
