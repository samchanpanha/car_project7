import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

export const metadata: Metadata = {
  title: "Compare vehicles",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return <AppChrome initialView={{ name: "compare" }} />;
}
