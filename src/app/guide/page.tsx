"use client";

import { useAppStore } from "@/lib/store";
import { Header } from "@/components/marketplace/header";
import { Footer } from "@/components/marketplace/footer";
import { MobileNav } from "@/components/marketplace/mobile-nav";
import { GuideView } from "@/components/marketplace/views/guide-view";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

function fontClassFor(locale: Locale): string {
  if (locale === "km") return "font-khmer";
  if (locale === "zh") return "font-cjk";
  return "";
}

export default function GuidePage() {
  const locale = useAppStore((s) => s.locale);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className={cn(fontClassFor(locale))}>
        <Header />
      </div>
      <main className="flex-1 flex flex-col" id="main">
        <div className={cn("flex-1", fontClassFor(locale))}>
          <GuideView />
        </div>
      </main>
      <div className={cn(fontClassFor(locale))}>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
