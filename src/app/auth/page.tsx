import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Sign in or create an account",
  robots: { index: false, follow: true },
};

export default async function AuthPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = sp.tab;
  const tab = (Array.isArray(raw) ? raw[0] : raw) === "signup" ? "signup" : "login";
  return <AppChrome initialView={{ name: "auth", tab }} />;
}
