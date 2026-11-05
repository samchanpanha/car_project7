import { AppChrome } from "@/components/marketplace/app-chrome";
import { getMarketingMetadata } from "@/lib/i18n/marketing-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return getMarketingMetadata("ev");
}

export default function EvPage() {
  return <AppChrome initialView={{ name: "ev" }} />;
}
