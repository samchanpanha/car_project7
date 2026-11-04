"use client";

import { useState, useEffect, useMemo } from "react";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CarFront,
  Bike,
  Wrench,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Flame,
  ArrowUpDown,
  Tag,
  ShieldCheck,
  MapPin,
  Check,
  ChevronDown,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MarketplaceCategory = "CAR" | "MOTOR" | "SPARE_PART";

export interface FilterState {
  // Category
  category: MarketplaceCategory;
  // Shared
  q: string;
  priceMin: string;
  priceMax: string;
  priceType: string;
  onSale: boolean;
  condition: string;
  status: string;
  city: string;
  locationPort: string;
  sort: string;
  // Car & Shared Vehicle
  make: string;
  model: string;
  variant: string; // Grade/Trim
  yearMin: string;
  yearMax: string;
  mileageMin: string;
  mileageMax: string;
  engineCcMin: string;
  engineCcMax: string;
  transmission: string;
  fuel: string;
  drivetrain: string;
  steering: string; // LEFT | RIGHT
  bodyType: string;
  seats: string;
  doors: string;
  chassisNo: string;
  stockNo: string;
  features: string[];
  // Motor Specific
  motorType: string;
  hasAbs: string; // "ALL" | "true" | "false"
  startType: string;
  // Spare Part Specific
  partCategory: string;
  partNumber: string;
  oemBrand: string;
  isOem: string; // "ALL" | "true" | "false"
  position: string;
  compatibleMake: string;
  compatibleModel: string;
  compatibleYear: string;
}

export const INITIAL_FILTER_STATE: FilterState = {
  category: "CAR",
  q: "",
  priceMin: "",
  priceMax: "",
  priceType: "ALL",
  onSale: false,
  condition: "ALL",
  status: "PUBLISHED",
  city: "ALL",
  locationPort: "ALL",
  sort: "newest",
  make: "ALL",
  model: "ALL",
  variant: "",
  yearMin: "",
  yearMax: "",
  mileageMin: "",
  mileageMax: "",
  engineCcMin: "",
  engineCcMax: "",
  transmission: "ALL",
  fuel: "ALL",
  drivetrain: "ALL",
  steering: "ALL",
  bodyType: "ALL",
  seats: "ALL",
  doors: "ALL",
  chassisNo: "",
  stockNo: "",
  features: [],
  motorType: "ALL",
  hasAbs: "ALL",
  startType: "ALL",
  partCategory: "ALL",
  partNumber: "",
  oemBrand: "ALL",
  isOem: "ALL",
  position: "ALL",
  compatibleMake: "ALL",
  compatibleModel: "ALL",
  compatibleYear: "",
};

export const CAMBODIA_LOCATIONS_AND_PORTS = [
  { value: "ALL", labelEn: "All Locations & Ports", labelKm: "គ្រប់ទីតាំង និងកំពង់ផែ" },
  { value: "Phnom Penh", labelEn: "Phnom Penh (Central)", labelKm: "រាជធានីភ្នំពេញ" },
  { value: "Sihanoukville Port", labelEn: "Sihanoukville Port (PAS Import)", labelKm: "កំពង់ផែស្វយ័តក្រុងព្រះសីហនុ" },
  { value: "Siem Reap", labelEn: "Siem Reap", labelKm: "ខេត្តសៀមរាប" },
  { value: "Battambang", labelEn: "Battambang", labelKm: "ខេត្តបាត់ដំបង" },
  { value: "Poipet Border", labelEn: "Poipet Border (Thai Import)", labelKm: "ច្រកទ្វារប៉ោយប៉ែត" },
  { value: "Kampot", labelEn: "Kampot", labelKm: "ខេត្តកំពត" },
  { value: "Koh Kong Border", labelEn: "Koh Kong Border", labelKm: "ច្រកទ្វារកោះកុង" },
  { value: "Bavet Border", labelEn: "Bavet Border", labelKm: "ច្រកទ្វារបាវិត" },
];

export const POPULAR_FEATURES = [
  "Sunroof",
  "Leather Seats",
  "360 Camera",
  "Apple CarPlay",
  "Android Auto",
  "Blind Spot Monitor",
  "Keyless Entry",
  "Heated Seats",
  "Lane Keep Assist",
  "Adaptive Cruise",
];

interface CategoryFilterTabsProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  totalResults?: number;
  availablePriceTypes?: Array<{ code: string; label: string; badgeColor: string }>;
  className?: string;
}

export function CategoryFilterTabs({
  filters,
  onChange,
  totalResults,
  availablePriceTypes = [
    { code: "HOT_PRICE", label: "Hot Price", badgeColor: "#EF4444" },
    { code: "PROMOTE_PRICE", label: "Promote Price", badgeColor: "#F59E0B" },
    { code: "DISCOUNT_PRICE", label: "Discount Price", badgeColor: "#10B981" },
    { code: "FLASH_SALE", label: "Flash Sale", badgeColor: "#EC4899" },
    { code: "CLEARANCE", label: "Clearance", badgeColor: "#8B5CF6" },
  ],
  className,
}: CategoryFilterTabsProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Makes and models state for dependent dropdown
  const [makesList, setMakesList] = useState<string[]>([]);
  const [modelsList, setModelsList] = useState<string[]>([]);
  const [loadingMakes, setLoadingMakes] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  // Fetch makes when category changes
  useEffect(() => {
    let active = true;
    setLoadingMakes(true);
    fetch(`/api/catalog/makes?category=${filters.category}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && data.makes) {
          setMakesList(data.makes);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingMakes(false);
      });

    return () => {
      active = false;
    };
  }, [filters.category]);

  // Fetch models when make changes (Dependent dropdown!)
  useEffect(() => {
    if (!filters.make || filters.make === "ALL") {
      setModelsList([]);
      return;
    }

    let active = true;
    setLoadingModels(true);
    fetch(`/api/catalog/models?category=${filters.category}&make=${encodeURIComponent(filters.make)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && data.models) {
          setModelsList(data.models);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingModels(false);
      });

    return () => {
      active = false;
    };
  }, [filters.category, filters.make]);

  const setPatch = (patch: Partial<FilterState>) => {
    onChange({ ...filters, ...patch });
  };

  const handleCategorySwitch = (cat: MarketplaceCategory) => {
    // Preserve shared fields (q, prices, onSale, condition, location, sort)
    onChange({
      ...filters,
      category: cat,
      make: "ALL",
      model: "ALL",
      variant: "",
    });
  };

  const handleReset = () => {
    onChange({
      ...INITIAL_FILTER_STATE,
      category: filters.category,
    });
  };

  // Count active non-default filters
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.q) count++;
    if (filters.priceMin || filters.priceMax) count++;
    if (filters.priceType !== "ALL") count++;
    if (filters.onSale) count++;
    if (filters.condition !== "ALL") count++;
    if (filters.city !== "ALL" || filters.locationPort !== "ALL") count++;
    if (filters.make !== "ALL") count++;
    if (filters.model !== "ALL") count++;
    if (filters.variant) count++;
    if (filters.yearMin || filters.yearMax) count++;
    if (filters.mileageMin || filters.mileageMax) count++;
    if (filters.steering !== "ALL") count++;
    if (filters.bodyType !== "ALL") count++;
    if (filters.seats !== "ALL") count++;
    if (filters.doors !== "ALL") count++;
    if (filters.chassisNo || filters.stockNo) count++;
    if (filters.features.length > 0) count++;
    if (filters.motorType !== "ALL") count++;
    if (filters.hasAbs !== "ALL") count++;
    if (filters.startType !== "ALL") count++;
    if (filters.partCategory !== "ALL") count++;
    if (filters.partNumber) count++;
    if (filters.oemBrand !== "ALL") count++;
    if (filters.isOem !== "ALL") count++;
    if (filters.position !== "ALL") count++;
    return count;
  }, [filters]);

  const toggleFeature = (feat: string) => {
    const next = filters.features.includes(feat)
      ? filters.features.filter((f) => f !== feat)
      : [...filters.features, feat];
    setPatch({ features: next });
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all",
        className,
      )}
      data-testid="category-filter-toolbar"
    >
      {/* 1. Category Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "CAR"}
            onClick={() => handleCategorySwitch("CAR")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              filters.category === "CAR"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <CarFront className="h-4 w-4 text-sky-600" />
            <span>{locale === "km" ? "រថយន្ត" : "Cars"}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "MOTOR"}
            onClick={() => handleCategorySwitch("MOTOR")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              filters.category === "MOTOR"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Bike className="h-4 w-4 text-amber-600" />
            <span>{locale === "km" ? "ម៉ូតូ" : "Motorcycles"}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "SPARE_PART"}
            onClick={() => handleCategorySwitch("SPARE_PART")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              filters.category === "SPARE_PART"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Wrench className="h-4 w-4 text-emerald-600" />
            <span>{locale === "km" ? "គ្រឿងបន្លាស់" : "Spare Parts"}</span>
          </button>
        </div>

        {/* Results Count & Reset Button */}
        <div className="flex items-center gap-2 text-xs">
          {totalResults != null && (
            <span className="font-medium text-slate-500" data-testid="filter-results-count">
              {locale === "km" ? `លទ្ធផល ${totalResults} ធាតុ` : `${totalResults} results found`}
            </span>
          )}
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 px-2 text-xs text-rose-600 hover:bg-rose-50"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {locale === "km" ? "កំណត់ឡើងវិញ" : "Clear Filters"}
            </Button>
          )}
        </div>
      </div>

      {/* 2. Primary Search & Quick Filter Bar (Shared Across All Categories) */}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12">
        {/* Keyword Search */}
        <div className="relative lg:col-span-4">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.q}
            onChange={(e) => setPatch({ q: e.target.value })}
            placeholder={
              filters.category === "CAR"
                ? locale === "km"
                  ? "ស្វែងរក ម៉ាក, ម៉ូឌែល, ស្លាកលេខ, តួកាដូ..."
                  : "Search make, model, chassis, VIN..."
                : filters.category === "MOTOR"
                ? locale === "km"
                  ? "ស្វែងរក ម៉ូតូ, ស្លាកលេខ, ស៊ីឡាំង..."
                  : "Search motorcycle make, model, cc..."
                : locale === "km"
                ? "ស្វែងរក លេខកូដគ្រឿងបន្លាស់ OEM, ម៉ាក..."
                : "Search OEM part no, brand, component..."
            }
            className="h-9.5 pl-9 pr-7 text-xs bg-slate-50/70 focus-visible:bg-white"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => setPatch({ q: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dependent Make Dropdown */}
        <div className="lg:col-span-2">
          <Select
            value={filters.make}
            onValueChange={(val) => setPatch({ make: val, model: "ALL" })}
          >
            <SelectTrigger className="h-9.5 text-xs">
              <SelectValue placeholder={loadingMakes ? "Loading..." : "All Makes"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Makes (ទាំងអស់)</SelectItem>
              {makesList.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dependent Model Dropdown */}
        <div className="lg:col-span-2">
          <Select
            value={filters.model}
            onValueChange={(val) => setPatch({ model: val })}
            disabled={filters.make === "ALL"}
          >
            <SelectTrigger className="h-9.5 text-xs">
              <SelectValue
                placeholder={
                  filters.make === "ALL"
                    ? "Select Make First"
                    : loadingModels
                    ? "Loading Models..."
                    : "All Models"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Models (គ្រប់ម៉ូឌែល)</SelectItem>
              {modelsList.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price Range: Min & Max */}
        <div className="flex items-center gap-1.5 lg:col-span-2">
          <Input
            type="number"
            min={0}
            placeholder="Min $"
            value={filters.priceMin}
            onChange={(e) => setPatch({ priceMin: e.target.value })}
            className="h-9.5 text-xs"
          />
          <span className="text-slate-400">-</span>
          <Input
            type="number"
            min={0}
            placeholder="Max $"
            value={filters.priceMax}
            onChange={(e) => setPatch({ priceMax: e.target.value })}
            className="h-9.5 text-xs"
          />
        </div>

        {/* Sort Select */}
        <div className="lg:col-span-2 flex items-center gap-1.5">
          <Select value={filters.sort} onValueChange={(val) => setPatch({ sort: val })}>
            <SelectTrigger className="h-9.5 text-xs flex-1">
              <ArrowUpDown className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">Newest (ថ្មីបំផុត)</SelectItem>
              <SelectItem value="price_asc" className="text-xs">Price: Low to High</SelectItem>
              <SelectItem value="price_desc" className="text-xs">Price: High to Low</SelectItem>
              <SelectItem value="discount_desc" className="text-xs">Biggest Discount (បញ្ចុះតម្លៃច្រើន)</SelectItem>
              <SelectItem value="year_desc" className="text-xs">Year: Newest</SelectItem>
              <SelectItem value="mileage_asc" className="text-xs">Mileage: Low to High</SelectItem>
            </SelectContent>
          </Select>

          {/* Toggle Advanced Filters Drawer */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              "h-9.5 px-3 text-xs gap-1 shrink-0 font-medium",
              showAdvanced || activeCount > 0
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "text-slate-700",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeCount > 0 && (
              <Badge className="h-4.5 px-1.5 text-[10px] bg-amber-500 text-white font-bold">
                {activeCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* 3. Promotional Quick Chips (On-Sale Toggle, Price Types) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
        {/* On-Sale Toggle */}
        <button
          type="button"
          onClick={() => setPatch({ onSale: !filters.onSale })}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-all cursor-pointer",
            filters.onSale
              ? "border-rose-400 bg-rose-50 text-rose-700 font-semibold shadow-xs"
              : "border-slate-200 text-slate-600 hover:border-slate-300",
          )}
        >
          <Flame className={cn("h-3.5 w-3.5", filters.onSale ? "text-rose-600 fill-rose-600" : "text-slate-400")} />
          <span>{locale === "km" ? "ទំនិញបញ្ចុះតម្លៃ (On Sale Only)" : "On Sale Only"}</span>
        </button>

        {/* Price Types Chips */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setPatch({ priceType: "ALL" })}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer",
              filters.priceType === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            All Price Types
          </button>
          {availablePriceTypes.map((pt) => {
            const active = filters.priceType === pt.code;
            return (
              <button
                key={pt.code}
                type="button"
                onClick={() => setPatch({ priceType: active ? "ALL" : pt.code })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1",
                  active
                    ? "border-transparent text-white shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                )}
                style={active ? { backgroundColor: pt.badgeColor } : undefined}
              >
                <Tag className="h-3 w-3" />
                <span>{pt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Category-Specific Extended Filters Panel */}
      {showAdvanced && (
        <div className="mt-4 space-y-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs animate-in fade-in-50">
          {/* Shared Row: Location & Port, Condition, Status */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <Label className="text-[11px] font-semibold text-slate-600">Location / Import Port</Label>
              <Select value={filters.locationPort} onValueChange={(val) => setPatch({ locationPort: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder="Location or Port" />
                </SelectTrigger>
                <SelectContent>
                  {CAMBODIA_LOCATIONS_AND_PORTS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value} className="text-xs">
                      {locale === "km" ? loc.labelKm : loc.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">Condition (ស្ថានភាព)</Label>
              <Select value={filters.condition} onValueChange={(val) => setPatch({ condition: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder="All Conditions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Conditions (ទាំងអស់)</SelectItem>
                  <SelectItem value="LIKE_NEW">Like New / Unregistered (ស្ទើរថ្មី)</SelectItem>
                  <SelectItem value="USED">Used (មួយទឹក)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">Steering (ចង្កូត)</Label>
              <Select value={filters.steering} onValueChange={(val) => setPatch({ steering: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder="Steering" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Steering (ឆ្វេង & ស្តាំ)</SelectItem>
                  <SelectItem value="LEFT">Left-Hand Drive (ចង្កូតឆ្វេង - LHD)</SelectItem>
                  <SelectItem value="RIGHT">Right-Hand Drive (ចង្កូតស្តាំ - RHD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">Listing Status</Label>
              <Select value={filters.status} onValueChange={(val) => setPatch({ status: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLISHED">Published / For Sale</SelectItem>
                  <SelectItem value="ALL">All (Including Sold & Review)</SelectItem>
                  <SelectItem value="SOLD">Sold Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TAB-SPECIFIC FILTERS */}
          {filters.category === "CAR" && (
            <div className="space-y-3 border-t border-slate-200/80 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Car Specifications & Import Filters
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <div>
                  <Label className="text-[11px] text-slate-600">Body Type</Label>
                  <Select value={filters.bodyType} onValueChange={(v) => setPatch({ bodyType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Body Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Bodies</SelectItem>
                      <SelectItem value="SUV">SUV</SelectItem>
                      <SelectItem value="SEDAN">Sedan</SelectItem>
                      <SelectItem value="PICKUP">Pickup</SelectItem>
                      <SelectItem value="VAN">Van</SelectItem>
                      <SelectItem value="HATCHBACK">Hatchback</SelectItem>
                      <SelectItem value="COUPE">Coupe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Transmission</Label>
                  <Select value={filters.transmission} onValueChange={(v) => setPatch({ transmission: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Transmission" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                      <SelectItem value="MANUAL">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Fuel Type</Label>
                  <Select value={filters.fuel} onValueChange={(v) => setPatch({ fuel: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Fuel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="PETROL">Petrol (សាំង)</SelectItem>
                      <SelectItem value="DIESEL">Diesel (ម៉ាស៊ូត)</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                      <SelectItem value="ELECTRIC">Electric (EV)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Drive Type</Label>
                  <Select value={filters.drivetrain} onValueChange={(v) => setPatch({ drivetrain: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Drivetrain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="AWD">AWD / 4WD</SelectItem>
                      <SelectItem value="FWD">FWD</SelectItem>
                      <SelectItem value="RWD">RWD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Seats (កៅអី)</Label>
                  <Select value={filters.seats} onValueChange={(v) => setPatch({ seats: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Seats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Any Seats</SelectItem>
                      <SelectItem value="2">2 Seats</SelectItem>
                      <SelectItem value="4">4 Seats</SelectItem>
                      <SelectItem value="5">5 Seats</SelectItem>
                      <SelectItem value="7">7 Seats</SelectItem>
                      <SelectItem value="8">8+ Seats</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Doors (ទ្វារ)</Label>
                  <Select value={filters.doors} onValueChange={(v) => setPatch({ doors: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Doors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Any</SelectItem>
                      <SelectItem value="2">2 Doors</SelectItem>
                      <SelectItem value="3">3 Doors</SelectItem>
                      <SelectItem value="4">4 Doors</SelectItem>
                      <SelectItem value="5">5 Doors</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Year, Mileage, Engine displacement, Grade/Trim, Stock No, Chassis No */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <div>
                  <Label className="text-[11px] text-slate-600">Year Range</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.yearMin}
                      onChange={(e) => setPatch({ yearMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.yearMax}
                      onChange={(e) => setPatch({ yearMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Mileage (Km)</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.mileageMin}
                      onChange={(e) => setPatch({ mileageMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.mileageMax}
                      onChange={(e) => setPatch({ mileageMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Engine CC</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Min cc"
                      value={filters.engineCcMin}
                      onChange={(e) => setPatch({ engineCcMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder="Max cc"
                      value={filters.engineCcMax}
                      onChange={(e) => setPatch({ engineCcMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Grade / Trim</Label>
                  <Input
                    placeholder="e.g. TX-L, Platinum, Sport"
                    value={filters.variant}
                    onChange={(e) => setPatch({ variant: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Chassis No / VIN</Label>
                  <Input
                    placeholder="Chassis or VIN"
                    value={filters.chassisNo}
                    onChange={(e) => setPatch({ chassisNo: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Stock No</Label>
                  <Input
                    placeholder="Dealer Stock #"
                    value={filters.stockNo}
                    onChange={(e) => setPatch({ stockNo: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Features & Options Checklist */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Features & Options</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {POPULAR_FEATURES.map((feat) => {
                    const checked = filters.features.includes(feat);
                    return (
                      <button
                        key={feat}
                        type="button"
                        onClick={() => toggleFeature(feat)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all cursor-pointer",
                          checked
                            ? "border-sky-500 bg-sky-50 text-sky-800 font-medium"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-xs border text-[10px]",
                            checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white",
                          )}
                        >
                          {checked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <span>{feat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* MOTORCYCLE SPECIFIC FILTERS */}
          {filters.category === "MOTOR" && (
            <div className="space-y-3 border-t border-slate-200/80 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Motorcycle Specific Filters
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <Label className="text-[11px] text-slate-600">Motorcycle Type</Label>
                  <Select value={filters.motorType} onValueChange={(v) => setPatch({ motorType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="SCOOTER">Scooter (Click, Scoopy, Air Blade)</SelectItem>
                      <SelectItem value="CUB">Cub / Semi-Auto (Dream 125, Wave)</SelectItem>
                      <SelectItem value="SPORT">Sport / Racing (CBR, R15, Ninja)</SelectItem>
                      <SelectItem value="CRUISER">Cruiser / Chopper</SelectItem>
                      <SelectItem value="DIRT">Dirt / Enduro (KLX)</SelectItem>
                      <SelectItem value="NAKED">Naked / Streetfighter</SelectItem>
                      <SelectItem value="TOURING">Touring / Adventure (GS)</SelectItem>
                      <SelectItem value="ELECTRIC">Electric Scooter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Engine Displacement CC</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Min cc"
                      value={filters.engineCcMin}
                      onChange={(e) => setPatch({ engineCcMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder="Max cc"
                      value={filters.engineCcMax}
                      onChange={(e) => setPatch({ engineCcMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">ABS Braking System</Label>
                  <Select value={filters.hasAbs} onValueChange={(v) => setPatch({ hasAbs: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="ABS" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Any (ABS or Non-ABS)</SelectItem>
                      <SelectItem value="true">ABS Equipped (មានហ្វ្រាំង ABS)</SelectItem>
                      <SelectItem value="false">Non-ABS Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Start Type (ប្រព័ន្ធបញ្ឆេះ)</Label>
                  <Select value={filters.startType} onValueChange={(v) => setPatch({ startType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Start Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Start Types</SelectItem>
                      <SelectItem value="ELECTRIC">Electric Start (ចុចបញ្ឆេះ)</SelectItem>
                      <SelectItem value="KICK">Kick Start (ធាក់បញ្ឆេះ)</SelectItem>
                      <SelectItem value="BOTH">Electric + Kick (ចុច និងធាក់)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* SPARE PART SPECIFIC FILTERS */}
          {filters.category === "SPARE_PART" && (
            <div className="space-y-3 border-t border-slate-200/80 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Spare Part & OEM Component Filters
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <Label className="text-[11px] text-slate-600">Part Category</Label>
                  <Select value={filters.partCategory} onValueChange={(v) => setPatch({ partCategory: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Categories</SelectItem>
                      <SelectItem value="ENGINE_TRANSMISSION">Engine & Transmission</SelectItem>
                      <SelectItem value="BRAKES_SUSPENSION">Brakes & Suspension</SelectItem>
                      <SelectItem value="TIRES_WHEELS">Tires & Wheels</SelectItem>
                      <SelectItem value="BATTERY_ELECTRICAL">Battery & Electrical</SelectItem>
                      <SelectItem value="LIGHTS_BULBS">Lights & Bulbs</SelectItem>
                      <SelectItem value="BODY_MIRRORS">Body & Mirrors</SelectItem>
                      <SelectItem value="OILS_LUBRICANTS">Oils & Lubricants</SelectItem>
                      <SelectItem value="ACCESSORIES">Accessories</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">OEM / Part Number</Label>
                  <Input
                    placeholder="e.g. 09.A820.11 or Part #"
                    value={filters.partNumber}
                    onChange={(e) => setPatch({ partNumber: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">OEM vs Aftermarket</Label>
                  <Select value={filters.isOem} onValueChange={(v) => setPatch({ isOem: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="true">OEM Genuine Parts (គ្រឿងស៊ីន)</SelectItem>
                      <SelectItem value="false">Aftermarket Performance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Position on Vehicle</Label>
                  <Select value={filters.position} onValueChange={(v) => setPatch({ position: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Positions</SelectItem>
                      <SelectItem value="FRONT">Front</SelectItem>
                      <SelectItem value="REAR">Rear</SelectItem>
                      <SelectItem value="LEFT">Left</SelectItem>
                      <SelectItem value="RIGHT">Right</SelectItem>
                      <SelectItem value="UNIVERSAL">Universal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Compatible Vehicle Details */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-[11px] text-slate-600">Compatible Vehicle Make</Label>
                  <Input
                    placeholder="e.g. Toyota, Honda"
                    value={filters.compatibleMake === "ALL" ? "" : filters.compatibleMake}
                    onChange={(e) => setPatch({ compatibleMake: e.target.value || "ALL" })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Compatible Vehicle Model</Label>
                  <Input
                    placeholder="e.g. Prius, Dream 125"
                    value={filters.compatibleModel === "ALL" ? "" : filters.compatibleModel}
                    onChange={(e) => setPatch({ compatibleModel: e.target.value || "ALL" })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">Compatible Year</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 2018"
                    value={filters.compatibleYear}
                    onChange={(e) => setPatch({ compatibleYear: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

