"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileSearch, EyeOff, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Public, crawlable trust explainer (/trust). Plain-language definitions of
 * what our badges and AI reports mean — and, just as importantly, what they do
 * NOT guarantee (we never present "no records" as "no accidents").
 */
export function TrustView() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);

  const badges = [
    {
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      title: t("trustBadgeSellerTitle"),
      body: t("trustBadgeSellerBody"),
    },
    {
      icon: ShieldCheck,
      color: "text-teal-600 bg-teal-50 border-teal-200",
      title: t("trustBadgeDealerTitle"),
      body: t("trustBadgeDealerBody"),
    },
    {
      icon: FileSearch,
      color: "text-sky-600 bg-sky-50 border-sky-200",
      title: t("trustReportsTitle"),
      body: t("trustReportsBody"),
    },
    {
      icon: EyeOff,
      color: "text-amber-600 bg-amber-50 border-amber-200",
      title: t("trustScopeTitle"),
      body: t("trustScopeBody"),
    },
  ];

  return (
    <div className="bg-slate-50 pb-24 md:pb-12">
      {/* Hero */}
      <div className="bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-amber-500/10 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 py-14 sm:px-6 text-center space-y-4">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1 text-xs font-semibold rounded-full inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {t("trustBadge")}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("trustPageTitle")}</h1>
          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">{t("trustSubtitle")}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate({ name: "browse" })} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5">
              <Search className="h-4 w-4 mr-2" aria-hidden />
              {t("trustCtaBrowse")}
            </Button>
            <Button onClick={() => navigate({ name: "sell" })} variant="outline" className="border-slate-700 bg-slate-900/60 text-white hover:bg-slate-800 font-semibold px-5">
              <Plus className="h-4 w-4 mr-2 text-amber-400" aria-hidden />
              {t("trustCtaSell")}
            </Button>
          </div>
        </div>
      </div>

      {/* Badge / report explainer cards */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10">
        <div className="grid gap-4 sm:grid-cols-2">
          {badges.map((b) => (
            <div key={b.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg border", b.color)}>
                <b.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-base font-bold text-slate-900">{b.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{b.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
          <p className="font-semibold">{t("trustHowTitle")}</p>
          <p className="mt-1.5">{t("trustHowBody")}</p>
        </div>
      </div>
    </div>
  );
}
