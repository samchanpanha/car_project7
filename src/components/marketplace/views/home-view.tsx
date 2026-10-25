"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, qs } from "@/lib/client-hooks";
import type { MetaDTO, SortOption } from "@/lib/types";
import type { PagedVehiclesResponseDTO } from "@/lib/listing-types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Pagination } from "@/components/marketplace/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  ShieldCheck,
  FileSearch,
  TriangleAlert,
  ArrowRight,
  CarFront,
  Bike,
  Wrench,
  BadgeCheck,
  Sparkles,
  Building2,
  UserCheck,
  RotateCcw,
  SlidersHorizontal,
  X,
  Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { partCategoryLabels, motorBodyTypeLabels } from "@/lib/i18n";

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"] as const;
const MOTOR_BODY_TYPES = ["SCOOTER", "CUB", "SPORT", "CRUISER", "DIRT", "ELECTRIC"] as const;
const PART_CATEGORIES = [
  "ENGINE", "TRANSMISSION", "BRAKES", "SUSPENSION", "TIRES_WHEELS",
  "ELECTRICAL", "BODY_LIGHTS", "OILS_FLUIDS", "ACCESSORIES"
] as const;

const PRICE_RANGES = [
  { id: "all", labelEn: "All Prices", labelKm: "គ្រប់តម្លៃ", min: undefined, max: undefined },
  { id: "under_25k", labelEn: "< $25k", labelKm: "< $25,000", min: undefined, max: 25000 },
  { id: "25k_50k", labelEn: "$25k - $50k", labelKm: "$25k - $50k", min: 25000, max: 50000 },
  { id: "50k_100k", labelEn: "$50k - $100k", labelKm: "$50k - $100k", min: 50000, max: 100000 },
  { id: "over_100k", labelEn: "$100k+", labelKm: "$100,000+", min: 100000, max: undefined },
] as const;

const POPULAR_BRANDS = ["Toyota", "Lexus", "Ford", "Mercedes-Benz", "Hyundai", "Kia", "Honda", "Mazda"];
const POPULAR_MOTOR_BRANDS = ["Honda", "Yamaha", "Suzuki", "Kawasaki", "BMW"];

export type SplitCategory = "ALL" | "CAR" | "MOTOR" | "CAR_PART" | "MOTOR_PART";

export function HomeView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);

  // Filter States
  const [splitCategory, setSplitCategory] = useState<SplitCategory>("ALL");
  const [partCategory, setPartCategory] = useState("all");
  const [q, setQ] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [make, setMake] = useState("all");
  const [bodyType, setBodyType] = useState("all");
  const [sellerType, setSellerType] = useState<"" | "DEALER" | "PRIVATE">("");
  const [sellerId, setSellerId] = useState("all");
  const [sellerVerified, setSellerVerified] = useState(false);
  const [priceRangeId, setPriceRangeId] = useState("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // Fetch metadata
  const { data: meta } = useFetch<MetaDTO>("/api/meta");

  // Derive price min/max from selected price range
  const activePriceRange = useMemo(
    () => PRICE_RANGES.find((p) => p.id === priceRangeId),
    [priceRangeId],
  );

  // Dynamic Search Placeholder based on active split category
  const heroSearchPlaceholder = useMemo(() => {
    if (splitCategory === "CAR_PART") return t("searchCarPartsPlaceholder");
    if (splitCategory === "MOTOR_PART") return t("searchMotorPartsPlaceholder");
    if (splitCategory === "MOTOR") return t("searchMotorPlaceholder");
    if (splitCategory === "CAR") return t("searchCarPlaceholder");
    return t("searchPlaceholder");
  }, [splitCategory, t]);

  // Dynamic Titles for the marketplace inventory section
  const inventoryTitle = useMemo(() => {
    if (splitCategory === "CAR") return locale === "km" ? "រថយន្តទាំងអស់ក្នុងផ្សារ" : "Explore All Cars in Cambodia";
    if (splitCategory === "MOTOR") return locale === "km" ? "ម៉ូតូទាំងអស់ក្នុងផ្សារ" : "Explore Motorcycles in Cambodia";
    if (splitCategory === "CAR_PART") return locale === "km" ? "គ្រឿងបន្លាស់រថយន្ត & OEM" : "Car Spare Parts & OEM Components";
    if (splitCategory === "MOTOR_PART") return locale === "km" ? "គ្រឿងបន្លាស់ម៉ូតូ & ប្រដាប់តុបតែង" : "Motorcycle Parts & Accessories";
    return locale === "km" ? "យានយន្ត និងគ្រឿងបន្លាស់ទាំងអស់" : "All Vehicles & Spare Parts in Cambodia";
  }, [splitCategory, locale]);

  const inventorySubtitle = useMemo(() => {
    if (splitCategory === "CAR") return t("categoryCarsDesc");
    if (splitCategory === "MOTOR") return t("categoryMotorsDesc");
    if (splitCategory === "CAR_PART") return t("categoryCarPartsDesc");
    if (splitCategory === "MOTOR_PART") return t("categoryMotorPartsDesc");
    return locale === "km"
      ? "ស្វែងរករថយន្ត ម៉ូតូ និងគ្រឿងបន្លាស់ពីឃ្លាំងផ្លូវការ និងម្ចាស់ផ្ទាល់ទូទាំងប្រទេសកម្ពុជា"
      : "Browse verified inventory with real-time stock counts, instant filtering, and dealer contacts.";
  }, [splitCategory, t, locale]);

  // Build query object for backend
  const queryObj = useMemo(() => {
    const params: Record<string, string | number> = {
      limit: pageSize,
      page,
      sort,
    };
    if (splitCategory === "CAR") {
      params.category = "CAR";
    } else if (splitCategory === "MOTOR") {
      params.category = "MOTOR";
    } else if (splitCategory === "CAR_PART") {
      params.category = "SPARE_PART";
      params.partTarget = "CAR";
    } else if (splitCategory === "MOTOR_PART") {
      params.category = "SPARE_PART";
      params.partTarget = "MOTOR";
    }
    if (partCategory && partCategory !== "all") {
      params.partCategory = partCategory;
    }
    if (q.trim()) params.q = q.trim();
    if (make && make !== "all") params.make = make;
    if (bodyType && bodyType !== "all") params.bodyType = bodyType;
    if (sellerType) params.sellerType = sellerType;
    if (sellerId && sellerId !== "all") params.sellerId = sellerId;
    if (sellerVerified) params.sellerVerified = "true";
    if (activePriceRange?.min != null) params.priceMin = activePriceRange.min;
    if (activePriceRange?.max != null) params.priceMax = activePriceRange.max;
    return params;
  }, [
    splitCategory,
    partCategory,
    q,
    make,
    bodyType,
    sellerType,
    sellerId,
    sellerVerified,
    activePriceRange,
    sort,
    page,
    pageSize,
  ]);

  // Main vehicle listing data (paged)
  const { data, loading } = useFetch<PagedVehiclesResponseDTO>(
    `/api/vehicles${qs(queryObj)}`,
  );

  // Fetch featured vehicles separately for the hero showcase
  const { data: featuredData } = useFetch<PagedVehiclesResponseDTO>(
    `/api/vehicles${qs({ limit: 4, featured: "true", sort: "newest" })}`,
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const featuredList = featuredData?.items ?? [];
  const sampleReportId = "veh_prado_2018";

  // Sellers and Dealers lists from metadata
  const sellersList = meta?.sellers ?? [];
  const dealersList = useMemo(
    () => sellersList.filter((s) => s.type === "DEALER"),
    [sellersList],
  );
  const privateList = useMemo(
    () => sellersList.filter((s) => s.type === "PRIVATE"),
    [sellersList],
  );

  const dealerVehiclesCount = useMemo(
    () => dealersList.reduce((acc, d) => acc + d.count, 0),
    [dealersList],
  );
  const privateVehiclesCount = useMemo(
    () => privateList.reduce((acc, p) => acc + p.count, 0),
    [privateList],
  );

  // Count active filters
  const hasActiveFilters = Boolean(
    q.trim() ||
      splitCategory !== "ALL" ||
      (partCategory && partCategory !== "all") ||
      (make && make !== "all") ||
      (bodyType && bodyType !== "all") ||
      sellerType ||
      (sellerId && sellerId !== "all") ||
      sellerVerified ||
      (priceRangeId && priceRangeId !== "all") ||
      sort !== "newest",
  );

  const resetFilters = () => {
    setSplitCategory("ALL");
    setPartCategory("all");
    setQ("");
    setSearchDraft("");
    setMake("all");
    setBodyType("all");
    setSellerType("");
    setSellerId("all");
    setSellerVerified(false);
    setPriceRangeId("all");
    setSort("newest");
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchDraft.trim());
    setPage(1);
    scrollToInventory();
  };

  const scrollToInventory = () => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("marketplace-inventory");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const selectedSeller = useMemo(
    () => sellersList.find((s) => s.id === sellerId),
    [sellersList, sellerId],
  );

  // 4-Pillar Visual Split Hero Cards
  const SPLIT_CARDS = useMemo(
    () => [
      {
        id: "CAR" as const,
        title: t("categoryCars"),
        desc: t("categoryCarsDesc"),
        icon: CarFront,
        count: meta?.categoryCounts?.car ?? 0,
        countLabel: locale === "km" ? "រថយន្ត" : "Cars",
        tags: [
          locale === "km" ? "សេដាន" : "Sedan",
          "SUV",
          locale === "km" ? "ភីកអាប់" : "Pickup",
          locale === "km" ? "ហាយប្រ៊ីដ" : "Hybrid",
        ],
        accentGradient: "from-amber-500/15 via-orange-500/5 to-transparent",
        accentBorder: "border-amber-300/80 hover:border-amber-500",
        iconBg: "bg-amber-100 text-amber-700",
        badgeBg: "bg-amber-500 text-slate-950",
        activeRing: "ring-2 ring-amber-500",
      },
      {
        id: "MOTOR" as const,
        title: t("categoryMotors"),
        desc: t("categoryMotorsDesc"),
        icon: Bike,
        count: meta?.categoryCounts?.motor ?? 0,
        countLabel: locale === "km" ? "គ្រឿង" : "Motors",
        tags: [
          locale === "km" ? "ស្កូទ័រ" : "Scooter",
          "Cub 125cc",
          locale === "km" ? "ស្ព័រ" : "Sport",
          "Cruiser",
        ],
        accentGradient: "from-sky-500/15 via-blue-500/5 to-transparent",
        accentBorder: "border-sky-300/80 hover:border-sky-500",
        iconBg: "bg-sky-100 text-sky-700",
        badgeBg: "bg-sky-600 text-white",
        activeRing: "ring-2 ring-sky-500",
      },
      {
        id: "CAR_PART" as const,
        title: t("categoryCarParts"),
        desc: t("categoryCarPartsDesc"),
        icon: Wrench,
        count: meta?.categoryCounts?.carPart ?? 0,
        countLabel: locale === "km" ? "គ្រឿងបន្លាស់" : "Parts",
        tags: [
          locale === "km" ? "ហ្វ្រាំង" : "Brakes",
          locale === "km" ? "អាគុយ" : "Battery",
          locale === "km" ? "តម្រងប្រេង" : "Filters",
          "OEM",
        ],
        accentGradient: "from-indigo-500/15 via-violet-500/5 to-transparent",
        accentBorder: "border-indigo-300/80 hover:border-indigo-500",
        iconBg: "bg-indigo-100 text-indigo-700",
        badgeBg: "bg-indigo-600 text-white",
        activeRing: "ring-2 ring-indigo-500",
      },
      {
        id: "MOTOR_PART" as const,
        title: t("categoryMotorParts"),
        desc: t("categoryMotorPartsDesc"),
        icon: Wrench,
        count: meta?.categoryCounts?.motorPart ?? 0,
        countLabel: locale === "km" ? "គ្រឿងបន្លាស់" : "Parts",
        tags: [
          locale === "km" ? "កង់ & សំបក" : "Tires",
          locale === "km" ? "ច្រវ៉ាក់ & ញ៉ុង" : "Chains",
          locale === "km" ? "ប៊ូស៊ី" : "Plugs",
          locale === "km" ? "ភ្លើង" : "Lights",
        ],
        accentGradient: "from-emerald-500/15 via-teal-500/5 to-transparent",
        accentBorder: "border-emerald-300/80 hover:border-emerald-500",
        iconBg: "bg-emerald-100 text-emerald-700",
        badgeBg: "bg-emerald-600 text-white",
        activeRing: "ring-2 ring-emerald-500",
      },
    ],
    [meta?.categoryCounts, t, locale],
  );

  return (
    <div className="pb-16 md:pb-12 space-y-12">
      {/* ---------- Hero Section ---------- */}
      <section className="kl-hero text-white relative overflow-hidden" aria-labelledby="hero-title">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-16">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-300 mb-4 shadow-sm backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t("tagline")}
            </p>
            <h1 id="hero-title" className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-200 leading-relaxed max-w-2xl">
              {t("heroSubtitle")}
            </p>
          </div>

          {/* Marketplace Category Selection Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {[
              { id: "ALL", label: t("categoryAll"), icon: null, count: meta?.categoryCounts?.total },
              { id: "CAR", label: t("categoryCars"), icon: CarFront, count: meta?.categoryCounts?.car },
              { id: "MOTOR", label: t("categoryMotors"), icon: Bike, count: meta?.categoryCounts?.motor },
              { id: "CAR_PART", label: t("categoryCarParts"), icon: Wrench, count: meta?.categoryCounts?.carPart },
              { id: "MOTOR_PART", label: t("categoryMotorParts"), icon: Wrench, count: meta?.categoryCounts?.motorPart },
            ].map((cat) => {
              const Icon = cat.icon;
              const active = splitCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSplitCategory(cat.id as SplitCategory);
                    setPartCategory("all");
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all shadow-sm cursor-pointer",
                    active
                      ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-md",
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  <span>{cat.label}</span>
                  {cat.count != null && (
                    <span
                      className={cn(
                        "ml-1 text-[11px] px-1.5 py-0.2 rounded-full font-bold",
                        active ? "bg-slate-950/20 text-slate-950" : "bg-white/20 text-white",
                      )}
                    >
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Hero Search & Filter Bar */}
          <form onSubmit={handleSearchSubmit} className="mt-4 max-w-4xl" role="search">
            <div className="flex flex-col sm:flex-row gap-2 rounded-2xl bg-white p-2.5 shadow-2xl backdrop-blur-md border border-slate-100">
              {/* Search text input */}
              <div className="flex-1 flex items-center gap-2.5 px-3 min-w-0">
                <Search className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={heroSearchPlaceholder}
                  className="border-0 h-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 px-0 text-sm"
                  aria-label={t("searchButton")}
                />
                {searchDraft && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDraft("");
                      setQ("");
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Make select */}
              <div className="w-full sm:w-44 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-2">
                <Select
                  value={make}
                  onValueChange={(val) => {
                    setMake(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-0 bg-transparent text-slate-900 focus:ring-0 text-xs sm:text-sm" aria-label={t("allMakes")}>
                    <SelectValue placeholder={t("allMakes")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">{t("allMakes")}</SelectItem>
                    {(meta?.makes ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dealer / Seller filter select */}
              <div className="w-full sm:w-56 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-2">
                <Select
                  value={sellerId}
                  onValueChange={(val) => {
                    setSellerId(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-full border-0 bg-transparent text-slate-900 focus:ring-0 text-xs sm:text-sm font-medium" aria-label={t("filterBySeller")}>
                    <div className="flex items-center gap-1.5 truncate">
                      <Building2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <SelectValue placeholder={t("allDealersAndSellers")} />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="all">{t("allDealersAndSellers")}</SelectItem>
                    {dealersList.length > 0 && (
                      <div className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50/70 uppercase tracking-wider rounded my-1">
                        🏢 {locale === "km" ? "ឃ្លាំងឡានផ្លូវការ (Dealers)" : "Certified Dealerships"}
                      </div>
                    )}
                    {dealersList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <span className="font-medium text-slate-900">{d.shopName || d.name}</span>{" "}
                        <span className="text-xs text-slate-500">({d.count})</span>
                      </SelectItem>
                    ))}
                    {privateList.length > 0 && (
                      <div className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 uppercase tracking-wider rounded my-1 mt-2">
                        👤 {locale === "km" ? "ម្ចាស់ផ្ទាល់ (Private Sellers)" : "Private Sellers"}
                      </div>
                    )}
                    {privateList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium text-slate-900">{s.name}</span>{" "}
                        <span className="text-xs text-slate-500">({s.count})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 shadow-md transition-all shrink-0 cursor-pointer"
              >
                <Search className="h-4 w-4 mr-1.5" />
                {t("searchButton")}
              </Button>
            </div>
          </form>

          {/* Quick Brand Pills */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-300 font-medium mr-1">{locale === "km" ? "ម៉ាកពេញនិយម:" : "Popular Brands:"}</span>
            {POPULAR_BRANDS.map((b) => {
              const active = make === b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setMake(active ? "all" : b);
                    setPage(1);
                    scrollToInventory();
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                    active
                      ? "bg-amber-400 text-slate-950 border-amber-300 font-semibold shadow-sm"
                      : "border-white/20 bg-white/10 text-slate-200 hover:bg-white/20 hover:text-white",
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>

          {/* Body Type Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-300 font-medium mr-1">{locale === "km" ? "ប្រភេទតួ:" : "Body Types:"}</span>
            {BODY_TYPES.map((bt) => {
              const active = bodyType === bt;
              return (
                <button
                  key={bt}
                  type="button"
                  onClick={() => {
                    setBodyType(active ? "all" : bt);
                    setPage(1);
                    scrollToInventory();
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                    active
                      ? "bg-white text-slate-950 border-white font-semibold shadow-sm"
                      : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white",
                  )}
                >
                  {bt === "SUV"
                    ? "SUV"
                    : bt === "SEDAN"
                      ? locale === "km" ? "សេដាន (Sedan)" : "Sedan"
                      : bt === "PICKUP"
                        ? locale === "km" ? "ឡានដឹក (Pickup)" : "Pickup"
                        : bt === "VAN"
                          ? locale === "km" ? "វ៉ាន (Van / MPV)" : "Van"
                          : bt === "HATCHBACK"
                            ? "Hatchback"
                            : "Coupe"}
                </button>
              );
            })}
          </div>

          {/* Stats Badges */}
          <dl className="mt-8 grid grid-cols-3 gap-3 max-w-xl">
            {[
              {
                label: t("statsListings"),
                value: total > 0 ? `${total}+` : (loading ? "…" : "30+"),
                icon: CarFront,
                color: "text-amber-400",
              },
              {
                label: t("statsDealers"),
                value: dealersList.length > 0 ? `${dealersList.length}` : "2",
                icon: Building2,
                color: "text-emerald-400",
              },
              {
                label: t("statsReports"),
                value: "10+",
                icon: FileSearch,
                color: "text-sky-400",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm p-3.5 shadow-sm transition-transform hover:scale-[1.02]"
              >
                <dt className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300">
                  <s.icon className={cn("h-4 w-4", s.color)} aria-hidden />
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className="mt-1.5 text-xl sm:text-2xl font-black text-white">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- 4-Pillar Visual Split Hero Cards (Hybrid Hub) ---------- */}
      <section className="mx-auto max-w-7xl px-4" aria-labelledby="marketplace-hub-title">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
              {locale === "km" ? "ជម្រើសទិញ-លក់តាមផ្នែក" : "Explore by Category"}
            </p>
            <h2 id="marketplace-hub-title" className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {locale === "km" ? "ស្វែងរកតាមប្រភេទយានយន្ត និងគ្រឿងបន្លាស់" : "Find What You Need in Cambodia"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md">
            {locale === "km"
              ? "រថយន្ត ម៉ូតូ និងគ្រឿងបន្លាស់សុទ្ធពីឃ្លាំង និងម្ចាស់ផ្ទាល់ដែលបានត្រួតពិនិត្យ"
              : "Browse verified inventory with real-time stock counts, instant filtering, and dealer contacts."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SPLIT_CARDS.map((card) => {
            const Icon = card.icon;
            const active = splitCategory === card.id;
            return (
              <div
                key={card.id}
                onClick={() => {
                  setSplitCategory(card.id);
                  setPartCategory("all");
                  setPage(1);
                  scrollToInventory();
                }}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all duration-200 cursor-pointer overflow-hidden",
                  active
                    ? cn("bg-white shadow-md ring-2", card.activeRing, card.accentBorder)
                    : cn("bg-white hover:shadow-lg hover:-translate-y-1", card.accentBorder),
                )}
              >
                {/* Subtle gradient backdrop */}
                <div
                  className={cn(
                    "absolute inset-0 bg-gradient-to-br opacity-50 pointer-events-none transition-opacity group-hover:opacity-100",
                    card.accentGradient,
                  )}
                />

                <div className="relative">
                  {/* Header: Icon + Count badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl font-bold shadow-xs", card.iconBg)}>
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold shadow-xs", card.badgeBg)}>
                      {card.count} {card.countLabel}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="mt-3.5 text-base sm:text-lg font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {card.desc}
                  </p>

                  {/* Quick Tags */}
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-100/90 group-hover:bg-white text-slate-600 px-2 py-0.5 text-[11px] font-medium border border-slate-200/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer action link */}
                <div className="relative mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900 group-hover:text-amber-600">
                  <span>{locale === "km" ? "មើលទំនិញទាំងអស់" : "Explore Category"}</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Featured Section (Showcased Vehicles) ---------- */}
      {featuredList.length > 0 && !hasActiveFilters && (
        <section className="mx-auto max-w-7xl px-4" aria-labelledby="featured-title">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h2 id="featured-title" className="text-xl sm:text-2xl font-bold text-slate-900">
                  {t("featuredListings")}
                </h2>
                <p className="text-xs text-slate-500">
                  {locale === "km" ? "រថយន្តពិសេសដែលបានត្រួតពិនិត្យ និងណែនាំ" : "Verified hand-picked spotlight vehicles in Cambodia"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setSellerType("");
                setPage(1);
                scrollToInventory();
              }}
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-semibold"
            >
              {t("viewAll")}
              <ArrowRight className="h-4 w-4 ml-1" aria-hidden />
            </Button>
          </div>
          <div className="mt-4 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {featuredList.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Comprehensive Marketplace Inventory Section ---------- */}
      <section
        id="marketplace-inventory"
        className="mx-auto max-w-7xl px-4 scroll-mt-6"
        aria-labelledby="marketplace-title"
      >
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <CarFront className="h-5 w-5" />
              </span>
              <h2 id="marketplace-title" className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {inventoryTitle}
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {inventorySubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {t("showingCars", { shown: items.length, total })}
            </span>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-slate-600 border-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t("clearFilters")}
              </Button>
            )}
          </div>
        </div>

        {/* 5-Way Split Category Segmented Bar */}
        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-slate-200/80">
          {[
            { id: "ALL", label: t("categoryAll"), icon: null, count: meta?.categoryCounts?.total ?? total },
            { id: "CAR", label: t("categoryCars"), icon: CarFront, count: meta?.categoryCounts?.car },
            { id: "MOTOR", label: t("categoryMotors"), icon: Bike, count: meta?.categoryCounts?.motor },
            { id: "CAR_PART", label: t("categoryCarParts"), icon: Wrench, count: meta?.categoryCounts?.carPart },
            { id: "MOTOR_PART", label: t("categoryMotorParts"), icon: Wrench, count: meta?.categoryCounts?.motorPart },
          ].map((cat) => {
            const Icon = cat.icon;
            const active = splitCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSplitCategory(cat.id as SplitCategory);
                  setPartCategory("all");
                  setPage(1);
                }}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer whitespace-nowrap border",
                  active
                    ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {Icon && <Icon className={cn("h-4 w-4", active ? "text-amber-400" : "text-slate-500")} />}
                <span>{cat.label}</span>
                {cat.count != null && (
                  <span
                    className={cn(
                      "ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      active ? "bg-amber-500 text-slate-950" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Contextual Sub-category Pills for Spare Parts */}
        {(splitCategory === "CAR_PART" || splitCategory === "MOTOR_PART") && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold mr-1">{t("partCategoryLabel")}:</span>
            <button
              type="button"
              onClick={() => {
                setPartCategory("all");
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                partCategory === "all"
                  ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
              )}
            >
              {t("categoryAll")}
            </button>
            {PART_CATEGORIES.map((pc) => {
              const active = partCategory === pc;
              return (
                <button
                  key={pc}
                  type="button"
                  onClick={() => {
                    setPartCategory(active ? "all" : pc);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                    active
                      ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                  )}
                >
                  {partCategoryLabels[pc]?.[locale] ?? pc}
                </button>
              );
            })}
          </div>
        )}

        {/* Contextual Sub-category Pills for Motorcycles */}
        {splitCategory === "MOTOR" && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold mr-1">{t("motorBodyType")}:</span>
            <button
              type="button"
              onClick={() => {
                setBodyType("all");
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                bodyType === "all"
                  ? "bg-sky-600 text-white border-sky-600 font-bold shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
              )}
            >
              {t("categoryAll")}
            </button>
            {MOTOR_BODY_TYPES.map((bt) => {
              const active = bodyType === bt;
              return (
                <button
                  key={bt}
                  type="button"
                  onClick={() => {
                    setBodyType(active ? "all" : bt);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 font-medium transition-all cursor-pointer text-xs border",
                    active
                      ? "bg-sky-600 text-white border-sky-600 font-bold shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                  )}
                >
                  {motorBodyTypeLabels[bt]?.[locale] ?? bt}
                </button>
              );
            })}
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="mt-4 space-y-4">
          {/* 1. Seller Type Main Segmented Tabs */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200/80">
            {/* All Cars Tab */}
            <button
              type="button"
              onClick={() => {
                setSellerType("");
                setSellerVerified(false);
                setSellerId("all");
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                sellerType === "" && !sellerVerified && sellerId === "all"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
              )}
            >
              <CarFront className="h-4 w-4 text-slate-500" />
              <span>{t("allCarsMarketplace")}</span>
              <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                {meta?.sellers?.reduce((acc, s) => acc + s.count, 0) ?? total}
              </span>
            </button>

            {/* Certified Dealers Tab */}
            <button
              type="button"
              onClick={() => {
                setSellerType("DEALER");
                setSellerVerified(false);
                setSellerId("all");
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                sellerType === "DEALER" && sellerId === "all"
                  ? "bg-amber-500 text-slate-950 shadow-sm font-bold"
                  : "text-slate-700 hover:text-slate-900 hover:bg-white/60",
              )}
            >
              <Building2 className="h-4 w-4" />
              <span>{t("certifiedDealers")}</span>
              <span className="ml-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                {dealerVehiclesCount} {locale === "km" ? "គ្រឿង" : "cars"}
              </span>
            </button>

            {/* Private Sellers Tab */}
            <button
              type="button"
              onClick={() => {
                setSellerType("PRIVATE");
                setSellerVerified(false);
                setSellerId("all");
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                sellerType === "PRIVATE" && sellerId === "all"
                  ? "bg-emerald-600 text-white shadow-sm font-bold"
                  : "text-slate-700 hover:text-slate-900 hover:bg-white/60",
              )}
            >
              <UserCheck className="h-4 w-4" />
              <span>{t("privateSellers")}</span>
              <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                {privateVehiclesCount} {locale === "km" ? "គ្រឿង" : "cars"}
              </span>
            </button>

            {/* Verified Sellers Tab */}
            <button
              type="button"
              onClick={() => {
                setSellerVerified(!sellerVerified);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ml-auto",
                sellerVerified
                  ? "bg-blue-600 text-white shadow-sm font-bold"
                  : "text-slate-700 hover:text-slate-900 hover:bg-white/60",
              )}
            >
              <BadgeCheck className="h-4 w-4 text-blue-400" />
              <span>{t("verifiedOnly")}</span>
            </button>
          </div>

          {/* 2. Secondary Filter Toolbar (Select specific Dealer/Seller, Brand, Price, Sort) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            {/* Filter by Specific Dealer / Seller */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {t("filterBySeller")}
              </label>
              <Select
                value={sellerId}
                onValueChange={(val) => {
                  setSellerId(val);
                  if (val !== "all") {
                    const match = sellersList.find((s) => s.id === val);
                    if (match) setSellerType(match.type);
                  }
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full bg-slate-50 border-slate-200 text-slate-800 text-xs font-medium">
                  <SelectValue placeholder={t("allDealersAndSellers")} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">{t("allDealersAndSellers")}</SelectItem>
                  {dealersList.length > 0 && (
                    <div className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 uppercase tracking-wider rounded my-1">
                      🏢 {locale === "km" ? "ឃ្លាំងឡានផ្លូវការ" : "Dealerships"}
                    </div>
                  )}
                  {dealersList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      🏢 {d.shopName || d.name} ({d.count} {locale === "km" ? "គ្រឿង" : "cars"})
                    </SelectItem>
                  ))}
                  {privateList.length > 0 && (
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 uppercase tracking-wider rounded my-1 mt-2">
                      👤 {locale === "km" ? "ម្ចាស់ផ្ទាល់" : "Private Sellers"}
                    </div>
                  )}
                  {privateList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      👤 {s.name} ({s.count} {locale === "km" ? "គ្រឿង" : "cars"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Make / Brand */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {locale === "km" ? "ម៉ាករថយន្ត" : "Make / Brand"}
              </label>
              <Select
                value={make}
                onValueChange={(val) => {
                  setMake(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full bg-slate-50 border-slate-200 text-slate-800 text-xs font-medium">
                  <SelectValue placeholder={t("allMakes")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">{t("allMakes")}</SelectItem>
                  {(meta?.makes ?? []).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Price Range */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {locale === "km" ? "កម្រិតតម្លៃ" : "Price Range"}
              </label>
              <Select
                value={priceRangeId}
                onValueChange={(val) => {
                  setPriceRangeId(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full bg-slate-50 border-slate-200 text-slate-800 text-xs font-medium">
                  <SelectValue placeholder={locale === "km" ? "គ្រប់តម្លៃ" : "All Prices"} />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGES.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id}>
                      {locale === "km" ? pr.labelKm : pr.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort by */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {t("sortBy")}
              </label>
              <Select
                value={sort}
                onValueChange={(val) => {
                  setSort(val as SortOption);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full bg-slate-50 border-slate-200 text-slate-800 text-xs font-medium">
                  <SelectValue placeholder={t("sortNewest")} />
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

          {/* 3. Active Filters Chips Bar */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-500 font-medium">{locale === "km" ? "តម្រងសកម្ម:" : "Active Filters:"}</span>

              {splitCategory !== "ALL" && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>
                    {splitCategory === "CAR"
                      ? t("categoryCars")
                      : splitCategory === "MOTOR"
                      ? t("categoryMotors")
                      : splitCategory === "CAR_PART"
                      ? t("categoryCarParts")
                      : t("categoryMotorParts")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCategory("ALL");
                      setPartCategory("all");
                    }}
                    className="hover:text-amber-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {partCategory !== "all" && (
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{partCategoryLabels[partCategory]?.[locale] ?? partCategory}</span>
                  <button
                    type="button"
                    onClick={() => setPartCategory("all")}
                    className="hover:text-indigo-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {q.trim() && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{locale === "km" ? "ស្វែងរក:" : "Search:"} "{q}"</span>
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setSearchDraft("");
                    }}
                    className="hover:text-amber-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {selectedSeller && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>
                    {selectedSeller.type === "DEALER" ? "🏢 " : "👤 "}
                    {selectedSeller.shopName || selectedSeller.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSellerId("all")}
                    className="hover:text-amber-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {!selectedSeller && sellerType && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{sellerType === "DEALER" ? t("certifiedDealers") : t("privateSellers")}</span>
                  <button
                    type="button"
                    onClick={() => setSellerType("")}
                    className="hover:text-amber-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {sellerVerified && (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{t("verifiedOnly")}</span>
                  <button
                    type="button"
                    onClick={() => setSellerVerified(false)}
                    className="hover:text-blue-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {make && make !== "all" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{locale === "km" ? "ម៉ាក:" : "Make:"} {make}</span>
                  <button
                    type="button"
                    onClick={() => setMake("all")}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {bodyType && bodyType !== "all" && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{locale === "km" ? "តួ:" : "Body:"} {bodyType}</span>
                  <button
                    type="button"
                    onClick={() => setBodyType("all")}
                    className="hover:text-slate-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {priceRangeId && priceRangeId !== "all" && activePriceRange && (
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-full px-2.5 py-0.5 font-medium">
                  <span>{locale === "km" ? activePriceRange.labelKm : activePriceRange.labelEn}</span>
                  <button
                    type="button"
                    onClick={() => setPriceRangeId("all")}
                    className="hover:text-emerald-700 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                {t("clearFilters")}
              </button>
            </div>
          )}
        </div>

        {/* 4. Car Grid (Extensive marketplace inventory) */}
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <VehicleCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length > 0 ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-12 text-center max-w-lg mx-auto my-8">
              <CarFront className="h-12 w-12 text-slate-300 mx-auto" />
              <h3 className="mt-3 text-lg font-bold text-slate-800">
                {locale === "km" ? "រកមិនឃើញរថយន្តទេ" : "No vehicles match your criteria"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {locale === "km"
                  ? "សូមសាកល្បងផ្លាស់ប្តូរតម្រង ឬសម្អាតតម្រងដើម្បីមើលរថយន្តទាំងអស់។"
                  : "Try loosening your search filters or clear all filters to see our full inventory."}
              </p>
              <Button
                variant="outline"
                onClick={resetFilters}
                className="mt-4 border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 font-semibold"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("clearFilters")}
              </Button>
            </div>
          )}
        </div>

        {/* 5. Pagination Bar */}
        {pageCount > 1 && (
          <div className="mt-8 pt-4 border-t border-slate-200">
            <Pagination
              page={page}
              pageCount={pageCount}
              onPageChange={(p) => {
                setPage(p);
                scrollToInventory();
              }}
              pageSize={pageSize}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
                scrollToInventory();
              }}
              pageSizeOptions={[12, 24, 36, 48]}
              totalItems={total}
            />
          </div>
        )}
      </section>

      {/* ---------- Trust & Safety Section ---------- */}
      <section className="mx-auto max-w-7xl px-4 pt-6" aria-labelledby="trust-title">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 sm:p-10 shadow-lg border border-slate-800">
          <div className="max-w-2xl">
            <h2 id="trust-title" className="text-2xl sm:text-3xl font-extrabold text-white">
              {t("trustTitle")}
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              {t("trustSubtitle")}
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: FileSearch,
                title: t("trustCard1Title"),
                body: t("trustCard1Body"),
                color: "text-teal-400 bg-teal-400/10 border-teal-400/20",
              },
              {
                icon: ShieldCheck,
                title: t("trustCard2Title"),
                body: t("trustCard2Body"),
                color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
              },
              {
                icon: TriangleAlert,
                title: t("trustCard3Title"),
                body: t("trustCard3Body"),
                color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
              >
                <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-lg border", c.color)}>
                  <c.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-bold text-white text-base">{c.title}</h3>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={() => navigate({ name: "report", vehicleId: sampleReportId })}
              className="border-teal-400/40 text-teal-300 bg-teal-950/40 hover:bg-teal-900/60 hover:text-white"
            >
              <FileSearch className="h-4 w-4 mr-2 text-teal-400" aria-hidden />
              {t("trySampleReport")}
              <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
            </Button>

            <Button
              variant="ghost"
              onClick={() => navigate({ name: "browse" })}
              className="text-slate-300 hover:text-white hover:bg-white/10 text-xs sm:text-sm"
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {locale === "km" ? "ស្វែងរកកម្រិតខ្ពស់ (Advanced Browse)" : "Open Advanced Browse Search"}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
