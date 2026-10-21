"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, qs } from "@/lib/client-hooks";
import type { MetaDTO, VehiclesResponseDTO } from "@/lib/types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ShieldCheck, FileSearch, TriangleAlert, ArrowRight, CarFront, BadgeCheck, Sparkles } from "lucide-react";
import { useState } from "react";

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"] as const;

export function HomeView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const [q, setQ] = useState("");
  const [make, setMake] = useState("");

  const { data: meta } = useFetch<MetaDTO>("/api/meta");
  const { data, loading } = useFetch<VehiclesResponseDTO>(`/api/vehicles${qs({ limit: 24, sort: "newest" })}`);

  const items = data?.items ?? [];
  const featured = items.filter((v) => v.featured).slice(0, 4);
  const recent = items.slice(0, 8);
  const sampleReportId = "veh_prado_2018";

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ name: "browse", q: q.trim() || undefined, make: make || undefined });
  };

  return (
    <div className="pb-16 md:pb-0">
      {/* ---------- Hero ---------- */}
      <section className="kl-hero text-white" aria-labelledby="hero-title">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300 mb-4">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t("tagline")}
            </p>
            <h1 id="hero-title" className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">{t("heroSubtitle")}</p>
          </div>

          {/* Search bar */}
          <form onSubmit={submitSearch} className="mt-6 max-w-3xl" role="search">
            <div className="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white/95 p-2 shadow-xl backdrop-blur">
              <div className="flex-1 flex items-center gap-2 px-2">
                <Search className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="border-0 h-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 px-0"
                  aria-label={t("searchButton")}
                />
              </div>
              <div className="w-full sm:w-44">
                <Select value={make} onValueChange={setMake}>
                  <SelectTrigger className="h-10 w-full border-slate-200 text-slate-900" aria-label={t("allMakes")}>
                    <SelectValue placeholder={t("allMakes")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allMakes")}</SelectItem>
                    {(meta?.makes ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                className="h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6"
              >
                {t("searchButton")}
              </Button>
            </div>
          </form>

          {/* Quick body-type chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {BODY_TYPES.map((bt) => (
              <button
                key={bt}
                onClick={() => navigate({ name: "browse", bodyType: bt })}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm text-slate-200 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                {bt === "SUV" ? "SUV" : bt === "SEDAN" ? (locale === "km" ? "ឡានសេដាន" : "Sedan") : bt === "PICKUP" ? (locale === "km" ? "ឡានផ្ទុក" : "Pickup") : bt === "VAN" ? (locale === "km" ? "វ៉ាន" : "Van / MPV") : bt === "HATCHBACK" ? (locale === "km" ? "ឡានបិទក្បាល" : "Hatchback") : "Coupe"}
              </button>
            ))}
          </div>

          {/* Stats */}
          <dl className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
            {[
              { label: t("statsListings"), value: data?.total ?? 0, icon: CarFront },
              { label: t("statsDealers"), value: 2, icon: BadgeCheck },
              { label: t("statsReports"), value: 10, icon: FileSearch },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <dt className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300">
                  <s.icon className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className="mt-1 text-xl sm:text-2xl font-bold text-white">
                  {s.label === t("statsListings") && loading ? "…" : s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- Trust section ---------- */}
      <section className="mx-auto max-w-7xl px-4 pt-10" aria-labelledby="trust-title">
        <h2 id="trust-title" className="text-xl sm:text-2xl font-bold text-slate-900">
          {t("trustTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-2xl">{t("trustSubtitle")}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            { icon: FileSearch, title: t("trustCard1Title"), body: t("trustCard1Body"), color: "text-teal-600 bg-teal-50" },
            { icon: ShieldCheck, title: t("trustCard2Title"), body: t("trustCard2Body"), color: "text-emerald-600 bg-emerald-50" },
            { icon: TriangleAlert, title: t("trustCard3Title"), body: t("trustCard3Body"), color: "text-amber-600 bg-amber-50" },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                <c.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => navigate({ name: "report", vehicleId: sampleReportId })}
          className="mt-4 border-teal-300 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
        >
          <FileSearch className="h-4 w-4 mr-2" aria-hidden />
          {t("trySampleReport")}
          <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
        </Button>
      </section>

      {/* ---------- Featured ---------- */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-10" aria-labelledby="featured-title">
          <div className="flex items-center justify-between">
            <h2 id="featured-title" className="text-xl sm:text-2xl font-bold text-slate-900">
              {t("featuredListings")}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate({ name: "browse" })} className="text-amber-600 hover:text-amber-700 hover:bg-amber-50">
              {t("viewAll")}
              <ArrowRight className="h-4 w-4 ml-1" aria-hidden />
            </Button>
          </div>
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Recently added ---------- */}
      <section className="mx-auto max-w-7xl px-4 pt-10" aria-labelledby="recent-title">
        <div className="flex items-center justify-between">
          <h2 id="recent-title" className="text-xl sm:text-2xl font-bold text-slate-900">
            {t("recentlyAdded")}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: "browse", sort: "newest" })} className="text-amber-600 hover:text-amber-700 hover:bg-amber-50">
            {t("viewAll")}
            <ArrowRight className="h-4 w-4 ml-1" aria-hidden />
          </Button>
        </div>
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <VehicleCardSkeleton key={i} />)
            : recent.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      </section>
    </div>
  );
}
