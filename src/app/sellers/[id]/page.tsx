import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = {
  title: "Seller profile",
  robots: { index: false, follow: true },
};

export default async function SellerPage({ params }: { params: Params }) {
  const { id } = await params;
  return <AppChrome initialView={{ name: "seller", userId: id }} />;
}
