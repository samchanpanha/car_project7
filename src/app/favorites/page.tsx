import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

export const metadata: Metadata = {
  title: "Favorites",
  robots: { index: false, follow: false },
};

export default function FavoritesPage() {
  return <AppChrome initialView={{ name: "favorites" }} />;
}
