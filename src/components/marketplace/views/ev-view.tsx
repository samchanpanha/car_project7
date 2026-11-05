"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { VehicleCardDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Zap, BatteryCharging, MapPin, FileSearch, Calculator, Search, Plus } from "lucide-react";

/**
 * Public `/ev` page — a hub for the Cambodia EV market: live EV inventory from
 * the marketplace, a short buyer's guide, and honest context (charging reality,
 * documents, indicative market stats).
 */
export function EvView() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);

  const { data, loading } = useFetch<{ items: VehicleCardDTO[] }>(
    "/api/vehicles?fuel=ELECTRIC&category=CAR&limit=8&sort=newest"
  );
  const evs = data?.items ?? [];

  const guide = [
    {
      icon: BatteryCharging,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      title: t("evGuide1Title"),
      body: t("evGuide1Body"),
    },
    {
      icon: MapPin,
      color: "text-sky-600 bg-sky-50 border-sky-200",
      title: t("evGuide2Title"),
      body: t("evGuide2Body"),
    },
    {
      icon: FileSearch,
      color: "text-amber-600 bg-amber-50 border-amber-200",
      title: t("evGuide3Title"),
      body: t("evGuide3Body"),
    },
  ];

  return (
    <div className="bg-slate-50 pb-24 md:pb-12 min-h-screen">
      {/* Hero */}
      <div className="bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-sky-500/10 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 py-14 sm:px-6 text-center space-y-4">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1 text-xs font-semibold rounded-full inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" aria-hidden />
            {t("evBadge")}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("evTitle")}</h1>
          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">{t("evSubtitle")}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate({ name: "financing" })} variant="outline" className="border-slate-700 bg-slate-900/60 text-white hover:bg-slate-800 font-semibold px-5">
              <Calculator className="h-4 w-4 mr-2 text-amber-400" aria-hidden />
              {t("evCtaFinancing")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 space-y-10">
        {/* Live inventory */}
        <section aria-labelledby="ev-inventory-title">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <h2 id="ev-inventory-title" className="text-xl sm:text-2xl font-black text-slate-900">
              {t("evInventoryTitle")}
            </h2>
            <Button variant="outline" size="sm" onClick={() => navigate({ name: "browse" })}>
              <Search className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              {t("evBrowseAll")}
            </Button>
          </div>

          {loading && !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <VehicleCardSkeleton key={i} />
              ))}
            </div>
          ) : evs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Zap className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-700">{t("evInventoryEmpty")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {evs.map((v) => (
                <VehicleCard key={v.id} vehicle={v} />
              ))}
            </div>
          )}
        </section>

        {/* Buyer's guide */}
        <section aria-labelledby="ev-guide-title">
          <h2 id="ev-guide-title" className="text-xl sm:text-2xl font-black text-slate-900">
            {t("evGuideTitle")}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {guide.map((g) => (
              <div key={g.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${g.color}`}>
                  <g.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{g.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{g.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Market context + disclaimer */}
        <section aria-labelledby="ev-stats-title">
          <h2 id="ev-stats-title" className="text-xl sm:text-2xl font-black text-slate-900">
            {t("evStatsTitle")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[t("evStats1"), t("evStats2"), t("evStats3")].map((s, i) => (
              <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs leading-relaxed text-emerald-950">
                {s}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{t("evDisclaimer")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => navigate({ name: "browse" })} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
              <Search className="h-4 w-4 mr-2" aria-hidden />
              {t("evBrowseAll")}
            </Button>
            <Button onClick={() => navigate({ name: "sell" })} variant="outline">
              <Plus className="h-4 w-4 mr-2 text-amber-600" aria-hidden />
              {t("evSellCta")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
