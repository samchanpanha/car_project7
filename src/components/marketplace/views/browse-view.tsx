"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, qs } from "@/lib/client-hooks";
import type { MetaDTO, VehiclesResponseDTO, SortOption } from "@/lib/types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SlidersHorizontal, Search } from "lucide-react";
import { useMemo, useState } from "react";

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"];
const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];

export interface BrowseFilters {
  q: string;
  make: string;
  bodyType: string;
  fuel: string;
  transmission: string;
  city: string;
  sellerType: string;
  sellerVerified: boolean;
  priceMin: string;
  priceMax: string;
  yearMin: string;
  mileageMax: string;
}

export function FiltersPanel({
  filters,
  setFilters,
  onClear,
}: {
  filters: BrowseFilters;
  setFilters: (f: BrowseFilters) => void;
  onClear: () => void;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data: meta } = useFetch<MetaDTO>("/api/meta");

  const set = (patch: Partial<BrowseFilters>) => setFilters({ ...filters, ...patch });
  const bodyTypeLabelsLocal: Record<string, string> = {
    SUV: "SUV", SEDAN: locale === "km" ? "ឡានសេដាន" : "Sedan", PICKUP: locale === "km" ? "ឡានផ្ទុក" : "Pickup",
    VAN: locale === "km" ? "វ៉ាន" : "Van / MPV", HATCHBACK: locale === "km" ? "ឡានបិទក្បាល" : "Hatchback", COUPE: "Coupe",
  };
  const fuelLabelsLocal: Record<string, string> = {
    PETROL: locale === "km" ? "សាំង" : "Petrol", DIESEL: locale === "km" ? "ម៉ាសុីត" : "Diesel",
    HYBRID: locale === "km" ? "ក្រមាស" : "Hybrid", ELECTRIC: locale === "km" ? "អគ្គិសនី" : "Electric",
  };
  const transLabelsLocal: Record<string, string> = {
    AUTOMATIC: locale === "km" ? "ស្វ័យប្រវត្តិ" : "Automatic", MANUAL: locale === "km" ? "ធម្មតា" : "Manual",
  };

  return (
    <div className="space-y-5" data-testid="filters-panel">
      <div>
        <Label htmlFor="f-q" className="text-xs text-slate-500">{t("searchPlaceholder")}</Label>
        <Input id="f-q" value={filters.q} onChange={(e) => set({ q: e.target.value })} className="mt-1.5 h-9" />
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("allMakes")}</Label>
        <Select value={filters.make || "all"} onValueChange={(v) => set({ make: v === "all" ? "" : v })}>
          <SelectTrigger className="mt-1.5 h-9" aria-label={t("allMakes")}>
            <SelectValue placeholder={t("allMakes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allMakes")}</SelectItem>
            {(meta?.makes ?? []).map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("bodyType")}</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {BODY_TYPES.map((bt) => (
            <button
              key={bt}
              onClick={() => set({ bodyType: filters.bodyType === bt ? "" : bt })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                filters.bodyType === bt
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
              aria-pressed={filters.bodyType === bt}
            >
              {bodyTypeLabelsLocal[bt]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("priceRange")}</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            type="number" min={0} placeholder={t("priceMin")} value={filters.priceMin}
            onChange={(e) => set({ priceMin: e.target.value })} className="h-9" aria-label={t("priceMin")}
          />
          <Input
            type="number" min={0} placeholder={t("priceMax")} value={filters.priceMax}
            onChange={(e) => set({ priceMax: e.target.value })} className="h-9" aria-label={t("priceMax")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="f-year" className="text-xs text-slate-500">{t("yearMin")}</Label>
          <Input id="f-year" type="number" min={1990} max={2026} placeholder="2015" value={filters.yearMin}
            onChange={(e) => set({ yearMin: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div>
          <Label htmlFor="f-mi" className="text-xs text-slate-500">{t("mileageMax")}</Label>
          <Input id="f-mi" type="number" min={0} step={10000} placeholder="150000" value={filters.mileageMax}
            onChange={(e) => set({ mileageMax: e.target.value })} className="mt-1.5 h-9" />
        </div>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("fuelType")}</Label>
        <Select value={filters.fuel || "all"} onValueChange={(v) => set({ fuel: v === "all" ? "" : v })}>
          <SelectTrigger className="mt-1.5 h-9" aria-label={t("fuelType")}>
            <SelectValue placeholder={t("fuelType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("fuelType")}</SelectItem>
            {FUELS.map((f) => (
              <SelectItem key={f} value={f}>{fuelLabelsLocal[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("transmission")}</Label>
        <Select value={filters.transmission || "all"} onValueChange={(v) => set({ transmission: v === "all" ? "" : v })}>
          <SelectTrigger className="mt-1.5 h-9" aria-label={t("transmission")}>
            <SelectValue placeholder={t("transmission")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transmission")}</SelectItem>
            {TRANSMISSIONS.map((tr) => (
              <SelectItem key={tr} value={tr}>{transLabelsLocal[tr]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("location")}</Label>
        <Select value={filters.city || "all"} onValueChange={(v) => set({ city: v === "all" ? "" : v })}>
          <SelectTrigger className="mt-1.5 h-9" aria-label={t("location")}>
            <SelectValue placeholder={t("allLocations")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allLocations")}</SelectItem>
            {(meta?.cities ?? []).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-slate-500">{t("sellerType")}</Label>
        <Select value={filters.sellerType || "any"} onValueChange={(v) => set({ sellerType: v === "any" ? "" : v })}>
          <SelectTrigger className="mt-1.5 h-9" aria-label={t("sellerType")}>
            <SelectValue placeholder={t("anySeller")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("anySeller")}</SelectItem>
            <SelectItem value="PRIVATE">{t("privateSeller")}</SelectItem>
            <SelectItem value="DEALER">{t("dealer")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
        <Label htmlFor="f-verified" className="text-xs font-medium text-slate-600 cursor-pointer">
          {t("verifiedOnly")}
        </Label>
        <Switch id="f-verified" checked={filters.sellerVerified} onCheckedChange={(v) => set({ sellerVerified: v })} />
      </div>

      <Button variant="ghost" size="sm" onClick={onClear} className="w-full text-slate-500 hover:text-slate-700">
        {t("clearFilters")}
      </Button>
    </div>
  );
}

export function BrowseView({ initial }: { initial?: { q?: string; make?: string; bodyType?: string; sort?: SortOption } }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);

  const [filters, setFilters] = useState<BrowseFilters>({
    q: initial?.q ?? "",
    make: initial?.make ?? "",
    bodyType: initial?.bodyType ?? "",
    fuel: "",
    transmission: "",
    city: "",
    sellerType: "",
    sellerVerified: false,
    priceMin: "",
    priceMax: "",
    yearMin: "",
    mileageMax: "",
  });
  const [sort, setSort] = useState<SortOption>(initial?.sort ?? "newest");
  const [page, setPage] = useState(0);
  const [applied, setApplied] = useState<BrowseFilters>(filters);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useMemo(() => {
    const params: Record<string, string | number> = { sort, limit: 12 };
    if (page > 0) params.cursor = page;
    if (applied.q.trim()) params.q = applied.q.trim();
    if (applied.make) params.make = applied.make;
    if (applied.bodyType) params.bodyType = applied.bodyType;
    if (applied.fuel) params.fuel = applied.fuel;
    if (applied.transmission) params.transmission = applied.transmission;
    if (applied.city) params.city = applied.city;
    if (applied.sellerType) params.sellerType = applied.sellerType;
    if (applied.sellerVerified) params.sellerVerified = "true";
    if (applied.priceMin) params.priceMin = Number(applied.priceMin);
    if (applied.priceMax) params.priceMax = Number(applied.priceMax);
    if (applied.yearMin) params.yearMin = Number(applied.yearMin);
    if (applied.mileageMax) params.mileageMax = Number(applied.mileageMax);
    return `/api/vehicles${qs(params)}`;
  }, [applied, sort, page]);

  const { data, loading, error } = useFetch<VehiclesResponseDTO>(query);

  const applyFromSheet = () => {
    setApplied(filters);
    setPage(0);
    setSheetOpen(false);
  };
  const clearAll = () => {
    const empty: BrowseFilters = {
      q: "", make: "", bodyType: "", fuel: "", transmission: "", city: "",
      sellerType: "", sellerVerified: false, priceMin: "", priceMax: "", yearMin: "", mileageMax: "",
    };
    setFilters(empty);
    setApplied(empty);
    setPage(0);
  };
  const updateFilters = (f: BrowseFilters) => {
    setFilters(f);
    // live-apply on desktop
    setApplied(f);
    setPage(0);
  };

  const items = data?.items ?? [];
  const activeFilterCount = Object.entries(applied).filter(([k, v]) => v && k !== "q").length + (applied.q ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("navBrowse")}</h1>
        <div className="flex items-center gap-2">
          {/* Mobile filter sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden">
                <SlidersHorizontal className="h-4 w-4 mr-1.5" aria-hidden />
                {t("filters")}
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-slate-950">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] overflow-y-auto kl-scroll">
              <SheetHeader>
                <SheetTitle>{t("filters")}</SheetTitle>
              </SheetHeader>
              <div className="pb-6">
                <FiltersPanel filters={filters} setFilters={setFilters} onClear={clearAll} />
                <Button onClick={applyFromSheet} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
                  <Search className="h-4 w-4 mr-2" aria-hidden />
                  {t("applyFilters")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Select value={sort} onValueChange={(v) => { setSort(v as SortOption); setPage(0); }}>
            <SelectTrigger className="h-9 w-[180px] text-sm" aria-label={t("sortBy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("sortNewest")}</SelectItem>
              <SelectItem value="price_asc">{t("sortPriceAsc")}</SelectItem>
              <SelectItem value="price_desc">{t("sortPriceDesc")}</SelectItem>
              <SelectItem value="year_desc">{t("sortYearDesc")}</SelectItem>
              <SelectItem value="mileage_asc">{t("sortMileageAsc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Desktop filters */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-4 max-h-[calc(100vh-6rem)] overflow-y-auto kl-scroll">
            <p className="mb-4 text-sm font-semibold text-slate-900">{t("filters")}</p>
            <FiltersPanel filters={filters} setFilters={updateFilters} onClear={clearAll} />
          </div>
        </aside>

        {/* Results */}
        <section aria-live="polite">
          <p className="text-sm text-slate-500 mb-3">
            {loading && page === 0 ? "…" : t("resultsCount", { n: data?.total ?? 0 })}
          </p>
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
              {error}
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3 font-medium text-slate-700">{t("noResults")}</p>
              <p className="mt-1 text-sm text-slate-500">{t("noResultsHint")}</p>
              <Button variant="outline" size="sm" onClick={clearAll} className="mt-4">
                {t("clearFilters")}
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {loading && page === 0
                  ? Array.from({ length: 6 }).map((_, i) => <VehicleCardSkeleton key={i} />)
                  : items.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
              </div>
              {data?.nextCursor && (
                <div className="mt-6 text-center">
                  <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={loading}>
                    {loading ? t("loading") : t("loadMore")}
                  </Button>
                </div>
              )}
              {!data?.nextCursor && items.length > 0 && (
                <p className="mt-6 text-center text-xs text-slate-400">
                  — {items.length} / {data?.total ?? 0} —
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* Back to home for mobile users landing deep */}
      <div className="mt-8 text-center md:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ name: "home" })} className="text-slate-500">
          ← {t("navHome")}
        </Button>
      </div>
    </div>
  );
}
