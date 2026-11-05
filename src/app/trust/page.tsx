import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `How Verification Works | ${SITE_NAME}`,
  description:
    "KhLan separates verified facts from claims. Learn what our Verified Seller, Verified Dealer, and AI vehicle report badges mean — and what they don't guarantee.",
  alternates: { canonical: `${SITE_URL}/trust` },
  openGraph: {
    type: "website",
    title: `How Verification Works | ${SITE_NAME}`,
    description:
      "Trust as a feature: every claim on KhLan carries a visible evidence status. See what our badges actually mean.",
    url: `${SITE_URL}/trust`,
  },
};

export default function TrustPage() {
  return <AppChrome initialView={{ name: "trust" }} />;
}
