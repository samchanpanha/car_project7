"use client";

import { useState, useEffect, useMemo } from "react";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import {
  bodyTypeLabels,
  transmissionLabels,
  fuelLabels,
  drivetrainLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
} from "@/lib/i18n";
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

export type MarketplaceCategory = "ALL" | "CAR" | "MOTOR" | "SPARE_PART";

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
  category: "ALL",
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
  { value: "ALL", labelEn: "All Locations & Ports", labelKm: "គ្រប់ទីតាំង និងកំពង់ផែ", labelZh: "所有地区与港口", labelVi: "Tất cả khu vực & Cảng" },
  { value: "Phnom Penh", labelEn: "Phnom Penh (Central)", labelKm: "រាជធានីភ្នំពេញ", labelZh: "金边市（市中心）", labelVi: "Phnôm Pênh (Trung tâm)" },
  { value: "Sihanoukville Port", labelEn: "Sihanoukville Port (PAS Import)", labelKm: "កំពង់ផែស្វយ័តក្រុងព្រះសីហនុ", labelZh: "西哈努克港（PAS进口港）", labelVi: "Cảng Sihanoukville (Nhập khẩu PAS)" },
  { value: "Siem Reap", labelEn: "Siem Reap", labelKm: "ខេត្តសៀមរាប", labelZh: "暹粒省", labelVi: "Xiêm Riệp" },
  { value: "Battambang", labelEn: "Battambang", labelKm: "ខេត្តបាត់ដំបង", labelZh: "马德望省", labelVi: "Battambang" },
  { value: "Poipet Border", labelEn: "Poipet Border (Thai Import)", labelKm: "ច្រកទ្វារប៉ោយប៉ែត", labelZh: "波贝口岸（泰柬边境）", labelVi: "Cửa khẩu Poipet (Thái Lan)" },
  { value: "Kampot", labelEn: "Kampot", labelKm: "ខេត្តកំពត", labelZh: "贡布省", labelVi: "Kampot" },
  { value: "Koh Kong Border", labelEn: "Koh Kong Border", labelKm: "ច្រកទ្វារកោះកុង", labelZh: "戈公口岸", labelVi: "Cửa khẩu Koh Kong" },
  { value: "Bavet Border", labelEn: "Bavet Border", labelKm: "ច្រកទ្វារបាវិត", labelZh: "巴域口岸（越柬边境）", labelVi: "Cửa khẩu Bavet (Việt Nam)" },
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
  categoryCounts?: {
    total?: number;
    car?: number;
    motor?: number;
    carPart?: number;
    motorPart?: number;
  };
  availablePriceTypes?: Array<{ code: string; label: string; badgeColor: string }>;
  className?: string;
}

export function CategoryFilterTabs({
  filters,
  onChange,
  totalResults,
  categoryCounts,
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
    const catParam = filters.category && filters.category !== "ALL" ? `?category=${filters.category}` : "";
    fetch(`/api/catalog/makes${catParam}`)
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
    const catParam = filters.category && filters.category !== "ALL" ? `&category=${filters.category}` : "";
    fetch(`/api/catalog/models?make=${encodeURIComponent(filters.make)}${catParam}`)
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
            aria-selected={filters.category === "ALL"}
            onClick={() => handleCategorySwitch("ALL")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filters.category === "ALL"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <span>{locale === "km" ? "ទាំងអស់" : "All"}</span>
            {categoryCounts?.total != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  filters.category === "ALL" ? "bg-slate-900 text-white" : "bg-slate-200/80 text-slate-600",
                )}
              >
                {categoryCounts.total}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "CAR"}
            onClick={() => handleCategorySwitch("CAR")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filters.category === "CAR"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <CarFront className="h-3.5 w-3.5 text-sky-600" />
            <span>{locale === "km" ? "រថយន្ត" : "Cars"}</span>
            {categoryCounts?.car != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  filters.category === "CAR" ? "bg-sky-600 text-white" : "bg-slate-200/80 text-slate-600",
                )}
              >
                {categoryCounts.car}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "MOTOR"}
            onClick={() => handleCategorySwitch("MOTOR")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filters.category === "MOTOR"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Bike className="h-3.5 w-3.5 text-amber-600" />
            <span>{locale === "km" ? "ម៉ូតូ" : "Motorcycles"}</span>
            {categoryCounts?.motor != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  filters.category === "MOTOR" ? "bg-amber-600 text-white" : "bg-slate-200/80 text-slate-600",
                )}
              >
                {categoryCounts.motor}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filters.category === "SPARE_PART"}
            onClick={() => handleCategorySwitch("SPARE_PART")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filters.category === "SPARE_PART"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Wrench className="h-3.5 w-3.5 text-emerald-600" />
            <span>{locale === "km" ? "គ្រឿងបន្លាស់" : "Spare Parts"}</span>
            {(categoryCounts?.carPart != null || categoryCounts?.motorPart != null) && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  filters.category === "SPARE_PART" ? "bg-emerald-600 text-white" : "bg-slate-200/80 text-slate-600",
                )}
              >
                {(categoryCounts?.carPart ?? 0) + (categoryCounts?.motorPart ?? 0)}
              </span>
            )}
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
              {t("clearFilters")}
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
                ? t("searchCarPlaceholder")
                : filters.category === "MOTOR"
                ? t("searchMotorPlaceholder")
                : t("searchPartsPlaceholder")
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
              <SelectValue placeholder={loadingMakes ? t("loading") : t("allMakes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allMakes")}</SelectItem>
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
                    ? t("filterSelectMakeFirst")
                    : loadingModels
                    ? t("filterLoadingModels")
                    : t("filterAllModels")
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("filterAllModels")}</SelectItem>
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
            placeholder={t("priceMin")}
            value={filters.priceMin}
            onChange={(e) => setPatch({ priceMin: e.target.value })}
            className="h-9.5 text-xs"
          />
          <span className="text-slate-400">-</span>
          <Input
            type="number"
            min={0}
            placeholder={t("priceMax")}
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
              <SelectValue placeholder={t("filterSortPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">{t("sortNewest")}</SelectItem>
              <SelectItem value="price_asc" className="text-xs">{t("sortPriceAsc")}</SelectItem>
              <SelectItem value="price_desc" className="text-xs">{t("sortPriceDesc")}</SelectItem>
              <SelectItem value="discount_desc" className="text-xs">{t("sortDiscountDesc")}</SelectItem>
              <SelectItem value="year_desc" className="text-xs">{t("sortYearDesc")}</SelectItem>
              <SelectItem value="mileage_asc" className="text-xs">{t("sortMileageAsc")}</SelectItem>
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
            <span>{t("filters")}</span>
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
              <Label className="text-[11px] font-semibold text-slate-600">{t("filterLocationPortLabel")}</Label>
              <Select value={filters.locationPort} onValueChange={(val) => setPatch({ locationPort: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder={t("filterLocationPort")} />
                </SelectTrigger>
                <SelectContent>
                  {CAMBODIA_LOCATIONS_AND_PORTS.map((loc) => {
                    const label =
                      locale === "km"
                        ? loc.labelKm
                        : locale === "zh"
                        ? (loc.labelZh || loc.labelEn)
                        : locale === "vi"
                        ? (loc.labelVi || loc.labelEn)
                        : loc.labelEn;
                    return (
                      <SelectItem key={loc.value} value={loc.value} className="text-xs">
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">{t("filterConditionLabel")}</Label>
              <Select value={filters.condition} onValueChange={(val) => setPatch({ condition: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder={t("filterAllConditions")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("filterAllConditions")}</SelectItem>
                  <SelectItem value="LIKE_NEW">{t("filterConditionLikeNew")}</SelectItem>
                  <SelectItem value="USED">{t("filterConditionUsed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">{t("filterSteeringLabel")}</Label>
              <Select value={filters.steering} onValueChange={(val) => setPatch({ steering: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder={t("filterSteering")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("filterSteeringAll")}</SelectItem>
                  <SelectItem value="LEFT">{t("filterSteeringLhd")}</SelectItem>
                  <SelectItem value="RIGHT">{t("filterSteeringRhd")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] font-semibold text-slate-600">{t("filterListingStatus")}</Label>
              <Select value={filters.status} onValueChange={(val) => setPatch({ status: val })}>
                <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                  <SelectValue placeholder={t("filterStatusPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLISHED">{t("filterStatusPublished")}</SelectItem>
                  <SelectItem value="ALL">{t("filterStatusAll")}</SelectItem>
                  <SelectItem value="SOLD">{t("filterStatusSoldOut")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TAB-SPECIFIC FILTERS */}
          {filters.category === "ALL" && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{t("filterViewingAllCategories")} </span>
              {t("filterCategoryHint")}
            </div>
          )}

          {filters.category === "CAR" && (
            <div className="space-y-3 border-t border-slate-200/80 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {t("filterCarSpecsHeader")}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("bodyType")}</Label>
                  <Select value={filters.bodyType} onValueChange={(v) => setPatch({ bodyType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("bodyType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllBodies")}</SelectItem>
                      {Object.keys(bodyTypeLabels).map((b) => (
                        <SelectItem key={b} value={b}>
                          {bodyTypeLabels[b]?.[locale] ?? b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("transmission")}</Label>
                  <Select value={filters.transmission} onValueChange={(v) => setPatch({ transmission: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("transmission")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllOption")}</SelectItem>
                      <SelectItem value="AUTOMATIC">{transmissionLabels.AUTOMATIC?.[locale] ?? "Automatic"}</SelectItem>
                      <SelectItem value="MANUAL">{transmissionLabels.MANUAL?.[locale] ?? "Manual"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("fuelType")}</Label>
                  <Select value={filters.fuel} onValueChange={(v) => setPatch({ fuel: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("fuelType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllOption")}</SelectItem>
                      {Object.keys(fuelLabels).map((f) => (
                        <SelectItem key={f} value={f}>
                          {fuelLabels[f]?.[locale] ?? f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterDrivetrainLabel")}</Label>
                  <Select value={filters.drivetrain} onValueChange={(v) => setPatch({ drivetrain: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterDrivetrainLabel")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllOption")}</SelectItem>
                      <SelectItem value="AWD">{drivetrainLabels.AWD?.[locale] ?? "AWD"}</SelectItem>
                      <SelectItem value="4WD">{drivetrainLabels["4WD"]?.[locale] ?? "4WD"}</SelectItem>
                      <SelectItem value="FWD">{drivetrainLabels.FWD?.[locale] ?? "FWD"}</SelectItem>
                      <SelectItem value="RWD">{drivetrainLabels.RWD?.[locale] ?? "RWD"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterSeatsLabel")}</Label>
                  <Select value={filters.seats} onValueChange={(v) => setPatch({ seats: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterSeatsPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAnySeats")}</SelectItem>
                      <SelectItem value="2">{t("filterSeatsCount", { n: 2 })}</SelectItem>
                      <SelectItem value="4">{t("filterSeatsCount", { n: 4 })}</SelectItem>
                      <SelectItem value="5">{t("filterSeatsCount", { n: 5 })}</SelectItem>
                      <SelectItem value="7">{t("filterSeatsCount", { n: 7 })}</SelectItem>
                      <SelectItem value="8">8+ {t("filterSeatsLabel")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterDoorsLabel")}</Label>
                  <Select value={filters.doors} onValueChange={(v) => setPatch({ doors: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterDoorsPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAnyDoors")}</SelectItem>
                      <SelectItem value="2">{t("filterDoorsCount", { n: 2 })}</SelectItem>
                      <SelectItem value="3">{t("filterDoorsCount", { n: 3 })}</SelectItem>
                      <SelectItem value="4">{t("filterDoorsCount", { n: 4 })}</SelectItem>
                      <SelectItem value="5">{t("filterDoorsCount", { n: 5 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Year, Mileage, Engine displacement, Grade/Trim, Stock No, Chassis No */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterYearRange")}</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder={t("filterYearMinPlaceholder")}
                      value={filters.yearMin}
                      onChange={(e) => setPatch({ yearMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder={t("filterYearMaxPlaceholder")}
                      value={filters.yearMax}
                      onChange={(e) => setPatch({ yearMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterMileageLabel")}</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder={t("filterMileageMinPlaceholder")}
                      value={filters.mileageMin}
                      onChange={(e) => setPatch({ mileageMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder={t("filterMileageMaxPlaceholder")}
                      value={filters.mileageMax}
                      onChange={(e) => setPatch({ mileageMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterEngineCc")}</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder={t("filterMinCcPlaceholder")}
                      value={filters.engineCcMin}
                      onChange={(e) => setPatch({ engineCcMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder={t("filterMaxCcPlaceholder")}
                      value={filters.engineCcMax}
                      onChange={(e) => setPatch({ engineCcMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterGradeTrimLabel")}</Label>
                  <Input
                    placeholder={t("filterTrimPlaceholder")}
                    value={filters.variant}
                    onChange={(e) => setPatch({ variant: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterChassisVinLabel")}</Label>
                  <Input
                    placeholder={t("filterChassisVin")}
                    value={filters.chassisNo}
                    onChange={(e) => setPatch({ chassisNo: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterStockNo")}</Label>
                  <Input
                    placeholder={t("filterStockPlaceholder")}
                    value={filters.stockNo}
                    onChange={(e) => setPatch({ stockNo: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Features & Options Checklist */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">{t("filterFeaturesOptionsLabel")}</Label>
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
                {t("filterMotorSpecsHeader")}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterMotorType")}</Label>
                  <Select value={filters.motorType} onValueChange={(v) => setPatch({ motorType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterMotorType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllMotorTypes")}</SelectItem>
                      {Object.keys(motorBodyTypeLabels).map((mb) => (
                        <SelectItem key={mb} value={mb}>
                          {motorBodyTypeLabels[mb]?.[locale] ?? mb}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterEngineDisplacementCc")}</Label>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder={t("filterMinCcPlaceholder")}
                      value={filters.engineCcMin}
                      onChange={(e) => setPatch({ engineCcMin: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                    <span>-</span>
                    <Input
                      type="number"
                      placeholder={t("filterMaxCcPlaceholder")}
                      value={filters.engineCcMax}
                      onChange={(e) => setPatch({ engineCcMax: e.target.value })}
                      className="h-8.5 text-xs bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterAbsBraking")}</Label>
                  <Select value={filters.hasAbs} onValueChange={(v) => setPatch({ hasAbs: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterAbsPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterMotorAbsAny")}</SelectItem>
                      <SelectItem value="true">{t("filterMotorAbsEquipped")}</SelectItem>
                      <SelectItem value="false">{t("filterMotorAbsNon")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterMotorStartTypeLabel")}</Label>
                  <Select value={filters.startType} onValueChange={(v) => setPatch({ startType: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterStartType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllStartTypes")}</SelectItem>
                      <SelectItem value="ELECTRIC">{t("filterMotorStartElectric")}</SelectItem>
                      <SelectItem value="KICK">{t("filterMotorStartKick")}</SelectItem>
                      <SelectItem value="BOTH">{t("filterMotorStartBoth")}</SelectItem>
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
                {t("filterPartsHeader")}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterPartCategory")}</Label>
                  <Select value={filters.partCategory} onValueChange={(v) => setPatch({ partCategory: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterPartCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllPartCategories")}</SelectItem>
                      {Object.keys(partCategoryLabels).map((pc) => (
                        <SelectItem key={pc} value={pc}>
                          {partCategoryLabels[pc]?.[locale] ?? pc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterPartNoLabel")}</Label>
                  <Input
                    placeholder={t("filterPartNoPlaceholder")}
                    value={filters.partNumber}
                    onChange={(e) => setPatch({ partNumber: e.target.value })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterOemVsAftermarket")}</Label>
                  <Select value={filters.isOem} onValueChange={(v) => setPatch({ isOem: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterAllPartTypes")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllPartTypes")}</SelectItem>
                      <SelectItem value="true">{t("filterOemGenuine")}</SelectItem>
                      <SelectItem value="false">{t("filterAftermarketPerformance")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterPositionOnVehicle")}</Label>
                  <Select value={filters.position} onValueChange={(v) => setPatch({ position: v })}>
                    <SelectTrigger className="mt-1 h-8.5 bg-white text-xs">
                      <SelectValue placeholder={t("filterPositionOnVehicle")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("filterAllPositions")}</SelectItem>
                      <SelectItem value="FRONT">{t("filterPosFront")}</SelectItem>
                      <SelectItem value="REAR">{t("filterPosRear")}</SelectItem>
                      <SelectItem value="LEFT">{t("filterPosLeft")}</SelectItem>
                      <SelectItem value="RIGHT">{t("filterPosRight")}</SelectItem>
                      <SelectItem value="UNIVERSAL">{t("filterPosUniversal")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Compatible Vehicle Details */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterCompatibleVehicleMakeLabel")}</Label>
                  <Input
                    placeholder={t("filterCompatibleMakePlaceholder")}
                    value={filters.compatibleMake === "ALL" ? "" : filters.compatibleMake}
                    onChange={(e) => setPatch({ compatibleMake: e.target.value || "ALL" })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterCompatibleVehicleModelLabel")}</Label>
                  <Input
                    placeholder={t("filterCompatibleModelPlaceholder")}
                    value={filters.compatibleModel === "ALL" ? "" : filters.compatibleModel}
                    onChange={(e) => setPatch({ compatibleModel: e.target.value || "ALL" })}
                    className="mt-1 h-8.5 text-xs bg-white"
                  />
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600">{t("filterCompatibleYearLabel")}</Label>
                  <Input
                    type="number"
                    placeholder={t("filterCompatibleYearPlaceholder")}
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

