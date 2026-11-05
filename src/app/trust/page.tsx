import { AppChrome } from "@/components/marketplace/app-chrome";
import { getMarketingMetadata } from "@/lib/i18n/marketing-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return getMarketingMetadata("trust");
}

export default function TrustPage() {
  return <AppChrome initialView={{ name: "trust" }} />;
}
