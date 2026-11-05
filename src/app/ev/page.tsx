import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Electric Vehicles in Cambodia | ${SITE_NAME}`,
  description:
    "Electric vehicle adoption is growing fast in Cambodia. Explore current EV listings on KhLan and read a practical buyer's guide on charging, range, and documents.",
  alternates: { canonical: `${SITE_URL}/ev` },
  openGraph: {
    type: "website",
    title: `Electric Vehicles in Cambodia | ${SITE_NAME}`,
    description: "Explore EVs listed on KhLan + a practical buyer's guide for Cambodia.",
    url: `${SITE_URL}/ev`,
  },
};

export default function EvPage() {
  return <AppChrome initialView={{ name: "ev" }} />;
}
