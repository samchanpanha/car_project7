"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, qs, apiSend } from "@/lib/client-hooks";
import type { MetaDTO, VehiclesResponseDTO, SortOption } from "@/lib/types";
import { bodyTypeLabels, fuelLabels, transmissionLabels, drivetrainLabels } from "@/lib/i18n";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SlidersHorizontal, Search, X, BookmarkPlus, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorText } from "@/components/marketplace/dashboard/bits";

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"];
const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];
const DRIVETRAINS = ["FWD", "RWD", "AWD"];
const CONDITIONS = ["LIKE_NEW", "USED"];

export interface BrowseFilters {
  q: string;
  make: string;
  bodyType: string[]; // multi-value, comma-joined to the API
  fuel: string[]; // multi-value
  transmission: string[]; // multi-value
  drivetrain: string[]; // multi-value
  condition: string; // LIKE_NEW | USED | ""
  city: string;
  sellerType: string; // PRIVATE | DEALER | ""
  sellerVerified: boolean;
  featured: boolean;
  hasReport: boolean;
  priceMin: string;
  priceMax: string;
  yearMin: string;
  yearMax: string;
  mileageMin: string;
  mileageMax: string;
}

export function emptyFilters(): BrowseFilters {
  return {
    q: "", make: "", bodyType: [], fuel: [], transmission: [], drivetrain: [],
    condition: "", city: "", sellerType: "", sellerVerified: false,
    featured: false, hasReport: false,
    priceMin: "", priceMax: "", yearMin: "", yearMax: "", mileageMin: "", mileageMax: "",
  };
}

/** Builds the API query params (advanced filters serialize arrays comma-joined). */
function buildParams(f: BrowseFilters, sort: SortOption, page: number): Record<string, string | number> {
  const params: Record<string, string | number> = { sort, limit: 12 };
  if (page > 0) params.cursor = page;
  if (f.q.trim()) params.q = f.q.trim();
  if (f.make) params.make = f.make;
  if (f.bodyType.length) params.bodyType = f.bodyType.join(",");
  if (f.fuel.length) params.fuel = f.fuel.join(",");
  if (f.transmission.length) params.transmission = f.transmission.join(",");
  if (f.drivetrain.length) params.drivetrain = f.drivetrain.join(",");
  if (f.condition) params.condition = f.condition;
  if (f.city) params.city = f.city;
  if (f.sellerType) params.sellerType = f.sellerType;
  if (f.sellerVerified) params.sellerVerified = "true";
  if (f.featured) params.featured = "true";
  if (f.hasReport) params.hasReport = "true";
  if (f.priceMin) params.priceMin = Number(f.priceMin);
  if (f.priceMax) params.priceMax = Number(f.priceMax);
  if (f.yearMin) params.yearMin = Number(f.yearMin);
  if (f.yearMax) params.yearMax = Number(f.yearMax);
  if (f.mileageMin) params.mileageMin = Number(f.mileageMin);
  if (f.mileageMax) params.mileageMax = Number(f.mileageMax);
  return params;
}

/** Toggle one value inside a multi-value filter array. */
function toggleValue(f: BrowseFilters, field: "bodyType" | "fuel" | "transmission" | "drivetrain", v: string): BrowseFilters {
  const cur = f[field];
  return { ...f, [field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
}

// ---------------- quick filter panel (sidebar + mobile sheet) ----------------

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
          {BODY_TYPES.map((bt) => {
            const active = filters.bodyType.includes(bt);
            return (
              <button
                key={bt}
                onClick={() => setFilters(toggleValue(filters, "bodyType", bt))}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "border-amber-500 bg-amber-50 text-amber-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
                aria-pressed={active}
              >
                {bodyTypeLabels[bt]?.[locale] ?? bt}
              </button>
            );
          })}
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

// ---------------- advanced filter fields (desktop card + mobile sheet) ----------------

function AdvancedFields({
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
  const set = (patch: Partial<BrowseFilters>) => setFilters({ ...filters, ...patch });

  const numberPair = (idA: string, labelA: string, a: keyof BrowseFilters, idB: string, labelB: string, b: keyof BrowseFilters) => (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label htmlFor={idA} className="text-xs text-slate-500">{labelA}</Label>
        <Input id={idA} type="number" min={0} value={filters[a] as string}
          onChange={(e) => set({ [a]: e.target.value } as Partial<BrowseFilters>)} className="mt-1.5 h-9" />
      </div>
      <div>
        <Label htmlFor={idB} className="text-xs text-slate-500">{labelB}</Label>
        <Input id={idB} type="number" min={0} value={filters[b] as string}
          onChange={(e) => set({ [b]: e.target.value } as Partial<BrowseFilters>)} className="mt-1.5 h-9" />
      </div>
    </div>
  );

  const checkGroup = (
    title: string,
    field: "bodyType" | "fuel" | "transmission" | "drivetrain",
    options: string[],
    labels: Record<string, { en: string; km: string }>
  ) => (
    <fieldset>
      <legend className="text-xs font-medium text-slate-500">{title}</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {options.map((o) => (
          <label
            key={o}
            className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-slate-300 has-[[data-state=checked]]:border-amber-400 has-[[data-state=checked]]:bg-amber-50"
          >
            <Checkbox
              checked={filters[field].includes(o)}
              onCheckedChange={() => setFilters(toggleValue(filters, field, o))}
              aria-label={`${title}: ${labels[o]?.[locale] ?? o}`}
            />
            <span className="truncate">{labels[o]?.[locale] ?? o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-4" data-testid="advanced-fields">
      {numberPair("af-pmin", t("priceMin"), "priceMin", "af-pmax", t("priceMax"), "priceMax")}
      {numberPair("af-ymin", t("yearMin"), "yearMin", "af-ymax", t("advYearMax"), "yearMax")}
      {numberPair("af-kmin", t("advMileageMin"), "mileageMin", "af-kmax", t("mileageMax"), "mileageMax")}

      <div className="grid gap-4 sm:grid-cols-2">
        {checkGroup(t("fuelType"), "fuel", FUELS, fuelLabels)}
        {checkGroup(t("transmission"), "transmission", TRANSMISSIONS, transmissionLabels)}
        {checkGroup(t("specDrivetrain"), "drivetrain", DRIVETRAINS, drivetrainLabels)}
        {checkGroup(t("bodyType"), "bodyType", BODY_TYPES, bodyTypeLabels)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs text-slate-500">{t("formCondition")}</Label>
          <Select value={filters.condition || "any"} onValueChange={(v) => set({ condition: v === "any" ? "" : v })}>
            <SelectTrigger className="mt-1.5 h-9" aria-label={t("formCondition")}>
              <SelectValue placeholder={t("anyCondition")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("anyCondition")}</SelectItem>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>{t(`cond${c}` as never)}</SelectItem>
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
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label htmlFor="af-verified" className="text-xs font-medium text-slate-600 cursor-pointer">{t("verifiedOnly")}</Label>
          <Switch id="af-verified" checked={filters.sellerVerified} onCheckedChange={(v) => set({ sellerVerified: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label htmlFor="af-featured" className="text-xs font-medium text-slate-600 cursor-pointer">{t("featuredOnly")}</Label>
          <Switch id="af-featured" checked={filters.featured} onCheckedChange={(v) => set({ featured: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label htmlFor="af-report" className="text-xs font-medium text-slate-600 cursor-pointer">{t("hasReport")}</Label>
          <Switch id="af-report" checked={filters.hasReport} onCheckedChange={(v) => set({ hasReport: v })} />
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onClear} className="w-full text-slate-500 hover:text-slate-700">
        {t("clearFilters")}
      </Button>
    </div>
  );
}

// ---------------- browse view ----------------

export function BrowseView({ initial }: { initial?: { q?: string; make?: string; bodyType?: string; sort?: SortOption } }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);

  const [filters, setFilters] = useState<BrowseFilters>(() => ({
    ...emptyFilters(),
    q: initial?.q ?? "",
    make: initial?.make ?? "",
    bodyType: initial?.bodyType ? [initial.bodyType] : [],
  }));
  const [sort, setSort] = useState<SortOption>(initial?.sort ?? "newest");
  const [page, setPage] = useState(0);
  const [applied, setApplied] = useState<BrowseFilters>(filters);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false); // desktop collapsible card
  const [advSheetOpen, setAdvSheetOpen] = useState(false); // mobile bottom sheet
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);

  const query = useMemo(() => {
    const params = buildParams(applied, sort, page);
    return `/api/vehicles${qs(params)}`;
  }, [applied, sort, page]);

  const { data, loading, error } = useFetch<VehiclesResponseDTO>(query);

  // Save search: params without pagination (sort kept)
  const saveQuery = useMemo(() => {
    const p = buildParams(applied, sort, 0);
    delete p.limit;
    delete p.cursor;
    return p;
  }, [applied, sort]);

  const canSaveSearch = Boolean(me) && !["ADMIN", "SUPER_ADMIN"].includes(me?.user.role ?? "") && !me?.tenant;

  const applyFilters = (f: BrowseFilters) => {
    setFilters(f);
    setApplied(f);
    setPage(0);
  };

  const applyFromSheet = () => {
    setApplied(filters);
    setPage(0);
    setSheetOpen(false);
  };
  const applyFromAdvSheet = () => {
    setApplied(filters);
    setPage(0);
    setAdvSheetOpen(false);
  };
  const clearAll = () => {
    const empty = emptyFilters();
    setFilters(empty);
    setApplied(empty);
    setPage(0);
  };

  // ---- active filter chips ----
  const chips = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (applied.q.trim()) list.push({ key: "q", label: `“${applied.q.trim()}”` });
    if (applied.make) list.push({ key: "make", label: `${t("formMake")}: ${applied.make}` });
    applied.bodyType.forEach((v) => list.push({ key: `bodyType:${v}`, label: bodyTypeLabels[v]?.[locale] ?? v }));
    applied.fuel.forEach((v) => list.push({ key: `fuel:${v}`, label: fuelLabels[v]?.[locale] ?? v }));
    applied.transmission.forEach((v) => list.push({ key: `transmission:${v}`, label: transmissionLabels[v]?.[locale] ?? v }));
    applied.drivetrain.forEach((v) => list.push({ key: `drivetrain:${v}`, label: drivetrainLabels[v]?.[locale] ?? v }));
    if (applied.condition) list.push({ key: "condition", label: `${t("formCondition")}: ${t(`cond${applied.condition}` as never)}` });
    if (applied.city) list.push({ key: "city", label: `${t("location")}: ${applied.city}` });
    if (applied.sellerType) list.push({ key: "sellerType", label: applied.sellerType === "DEALER" ? t("dealer") : t("privateSeller") });
    if (applied.sellerVerified) list.push({ key: "sellerVerified", label: t("verifiedOnly") });
    if (applied.featured) list.push({ key: "featured", label: t("featuredOnly") });
    if (applied.hasReport) list.push({ key: "hasReport", label: t("hasReport") });
    if (applied.priceMin) list.push({ key: "priceMin", label: `${t("priceRange")} ≥ ${formatUsd(Number(applied.priceMin))}` });
    if (applied.priceMax) list.push({ key: "priceMax", label: `${t("priceRange")} ≤ ${formatUsd(Number(applied.priceMax))}` });
    if (applied.yearMin) list.push({ key: "yearMin", label: `${t("specYear")} ≥ ${applied.yearMin}` });
    if (applied.yearMax) list.push({ key: "yearMax", label: `${t("specYear")} ≤ ${applied.yearMax}` });
    if (applied.mileageMin) list.push({ key: "mileageMin", label: `${t("specMileage")} ≥ ${applied.mileageMin}` });
    if (applied.mileageMax) list.push({ key: "mileageMax", label: `${t("specMileage")} ≤ ${applied.mileageMax}` });
    return list;
  }, [applied, t, locale]);

  const removeChip = (key: string) => {
    const next: BrowseFilters = { ...applied };
    if (key.includes(":")) {
      const [field, val] = key.split(":");
      const f = field as "bodyType" | "fuel" | "transmission" | "drivetrain";
      next[f] = next[f].filter((x) => x !== val);
    } else if (key === "sellerVerified" || key === "featured" || key === "hasReport") {
      next[key] = false;
    } else {
      (next as unknown as Record<string, string>)[key] = "";
    }
    applyFilters(next);
  };

  const saveSearch = async () => {
    if (!saveName.trim()) return;
    setSavingSearch(true);
    try {
      await apiSend("/api/account/saved-searches", "POST", { name: saveName.trim(), query: saveQuery });
      toast.success(t("toastSearchSaved"));
      setSaveOpen(false);
      setSaveName("");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSavingSearch(false);
    }
  };

  const items = data?.items ?? [];
  const activeFilterCount = chips.length;

  const advButton = (onClick: () => void) => (
    <Button variant="outline" size="sm" onClick={onClick} aria-expanded={advOpen} aria-label={t("advFilters")}>
      <SlidersHorizontal className="h-4 w-4 mr-1.5" aria-hidden />
      {t("advFilters")}
      {activeFilterCount > 0 && (
        <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-slate-950">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("navBrowse")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canSaveSearch && (
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} aria-label={t("saveSearchBtn")}>
              <BookmarkPlus className="h-4 w-4 mr-1.5" aria-hidden />
              {t("saveSearchBtn")}
            </Button>
          )}
          {/* Mobile advanced sheet trigger */}
          <div className="lg:hidden">{advButton(() => setAdvSheetOpen(true))}</div>
          {/* Desktop advanced toggle */}
          <div className="hidden lg:block">{advButton(() => setAdvOpen((o) => !o))}</div>

          {/* Mobile quick filter sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden">
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
            <SelectTrigger className="h-9 w-[132px] text-sm sm:w-[180px]" aria-label={t("sortBy")}>
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

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={t("activeFiltersLabel")}>
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-amber-800"
            >
              {c.label}
              <button
                onClick={() => removeChip(c.key)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-amber-600 hover:bg-amber-200 cursor-pointer"
                aria-label={`${t("remove")} ${c.label}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 cursor-pointer"
          >
            {t("clearFilters")}
          </button>
        </div>
      )}

      {/* Desktop advanced panel (collapsible card, spans full width) */}
      {advOpen && (
        <Card className="mt-4 hidden lg:block">
          <CardContent className="p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">{t("advFilters")}</p>
            <AdvancedFields filters={filters} setFilters={applyFilters} onClear={clearAll} />
            <Button
              onClick={() => { setApplied(filters); setPage(0); setAdvOpen(false); }}
              className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
            >
              <Search className="h-4 w-4 mr-2" aria-hidden />
              {t("applyFilters")}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Desktop quick filters */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-4 max-h-[calc(100vh-6rem)] overflow-y-auto kl-scroll">
            <p className="mb-4 text-sm font-semibold text-slate-900">{t("filters")}</p>
            <FiltersPanel filters={filters} setFilters={applyFilters} onClear={clearAll} />
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

      {/* Mobile advanced bottom sheet */}
      <Sheet open={advSheetOpen} onOpenChange={setAdvSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto kl-scroll">
          <SheetHeader>
            <SheetTitle>{t("advFilters")}</SheetTitle>
          </SheetHeader>
          <div className="pb-6">
            <AdvancedFields filters={filters} setFilters={setFilters} onClear={clearAll} />
            <Button onClick={applyFromAdvSheet} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
              <Search className="h-4 w-4 mr-2" aria-hidden />
              {t("applyFilters")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Save search dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-amber-600" aria-hidden />
              {t("saveSearchTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {chips.length === 0 ? (
              <p className="text-xs text-slate-400">{t("noResultsHint")}</p>
            ) : (
              chips.slice(0, 6).map((c) => (
                <span key={c.key} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
                  {c.label}
                </span>
              ))
            )}
          </div>
          <div>
            <Label htmlFor="ss-name" className="text-xs text-slate-500">{t("saveSearchNameLabel")}</Label>
            <Input id="ss-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} className="mt-1.5 h-9" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>{t("cancel")}</Button>
            <Button
              size="sm" onClick={saveSearch} disabled={savingSearch || !saveName.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
            >
              {savingSearch && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
              {t("saveSearchBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Back to home for mobile users landing deep */}
      <div className="mt-8 text-center md:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ name: "home" })} className="text-slate-500">
          ← {t("navHome")}
        </Button>
      </div>
    </div>
  );
}
