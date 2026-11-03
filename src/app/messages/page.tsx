import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = sp.c;
  const conversationId = Array.isArray(raw) ? raw[0] : raw;
  return <AppChrome initialView={{ name: "messages", conversationId }} />;
}
