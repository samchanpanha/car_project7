"use client";

// Seller / dealer (non-tenant) dashboard tabs — inventory ("add car for sell")
// and the virtual FREE-trial subscription. Tenant dealerships use the
// DealerDashboard instead; these tabs give individually-registered
// sellers/dealers the same core capabilities inside the CustomerDashboard.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { getPromoTierLabel } from "@/lib/i18n/labels";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { formatUsd, formatKhr, timeAgo } from "@/lib/format";
import type { MyListingRowDTO } from "@/lib/listing-types";
import type { PlanDTO, SellerSubscriptionDTO } from "@/lib/dashboard-types";
import { ListingEditorDialog } from "@/components/marketplace/listing-editor";
import { Pagination } from "@/components/marketplace/pagination";
import { RequestSubscriptionDialog, PendingPaymentBanner, TenantPaymentHistory, SubscriptionPaywallCard } from "./payment-flow";
import {
  EmptyState, FetchErrorState, SectionCard, StatCard, VehicleStatusBadge, formatDateTime,
} from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdvancedFilterToolbar, type AdvancedFilterValues } from "@/components/marketplace/advanced-filter-toolbar";
import {
  CalendarClock, CarFront, CheckCircle2, CreditCard, Eye, Flame, Loader2, Pencil, Plus, ShieldCheck, Sparkles, Tag, TriangleAlert, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------- inventory ----------------

const SELLER_STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "SOLD", label: "Sold" },
  { value: "ARCHIVED", label: "Archived" },
];

export function SellerInventory() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [promoVehicle, setPromoVehicle] = useState<MyListingRowDTO | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [filters, setFilters] = useState<AdvancedFilterValues>({
    q: "",
    status: "ALL",
    priceMin: "",
    priceMax: "",
    sort: "newest",
  });
  const { data, loading, error, refetch } = useFetch<MyListingRowDTO[]>("/api/vehicles/mine");

  const rows0 = data ?? [];
  const published = rows0.filter((v) => v.status === "PUBLISHED").length;
  const sold = rows0.filter((v) => v.status === "SOLD").length;
  const totalViews = rows0.reduce((sum, v) => sum + v.views, 0);

  const filtered = rows0.filter((v) => {
    if (filters.status && filters.status !== "ALL" && v.status !== filters.status) return false;
    if (filters.priceMin && v.priceUsd < Number(filters.priceMin)) return false;
    if (filters.priceMax && v.priceUsd > Number(filters.priceMax)) return false;
    if (filters.q?.trim()) {
      const term = filters.q.toLowerCase();
      const match = `${v.make} ${v.model} ${v.variant ?? ""} ${v.year}`.toLowerCase().includes(term);
      return match;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "price_asc":
        return a.priceUsd - b.priceUsd;
      case "price_desc":
        return b.priceUsd - a.priceUsd;
      case "views":
        return b.views - a.views;
      case "year_desc":
        return b.year - a.year;
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={CarFront} label={t("kpiListings")} value={published} />
        <StatCard icon={Eye} label={t("kpiTotalViews")} value={totalViews} />
        <StatCard icon={Sparkles} label={t("kpiSold")} value={sold} />
      </div>

      <div className="space-y-3">
        {/* Advanced Filter & Search Toolbar */}
        {rows0.length > 0 && (
          <AdvancedFilterToolbar
            values={filters}
            onChange={(next) => {
              setFilters(next);
              setPage(1);
            }}
            statusOptions={[
              { value: "ALL", label: t("filterStatusAll") },
              { value: "PUBLISHED", label: t("vstPUBLISHED") },
              { value: "DRAFT", label: t("vstDRAFT") },
              { value: "SOLD", label: t("vstSOLD") },
            ]}
            searchPlaceholder="Search make, model, year..."
            totalResults={sorted.length}
          />
        )}

        <SectionCard
          title={t("tabInventoryMine")}
          action={
            <Button
              size="sm"
              onClick={() => navigate({ name: "sell" })}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden />
              {t("invAddCar")}
            </Button>
          }
        >
          {loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full animate-pulse rounded-xl" />
              ))}
            </div>
          ) : error && !data ? (
            <FetchErrorState message={error} onRetry={refetch} />
          ) : rows0.length === 0 ? (
            <EmptyState
              icon={CarFront}
              text={t("invEmpty")}
              hint={t("invEmptyHint")}
              className="p-10"
              action={
                <Button
                  onClick={() => navigate({ name: "sell" })}
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
                >
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                  {t("invAddCar")}
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-xs text-slate-500">{t("dashEmptyVehiclesFiltered")}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({ q: "", status: "ALL", priceMin: "", priceMax: "", sort: "newest" });
                  setPage(1);
                }}
                className="mt-2 text-xs text-amber-700"
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">
                {t("invPublishedCount", { published })} · {t("myListingsHint")}
              </p>
              <ul className="divide-y divide-slate-100">
                {rows.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5">
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {v.images[0] ? (
                        <img src={v.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <CarFront className="h-5 w-5 text-slate-300" aria-hidden />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate({ name: "detail", vehicleId: v.id })}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900 hover:text-amber-700">
                          {v.make} {v.model} {v.variant ?? ""} {v.year}
                        </p>
                        {v.isOnSale && v.activePriceType && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase text-white shrink-0"
                            style={{ backgroundColor: v.activePriceType.badgeColor || "#ef4444" }}
                          >
                            <Flame className="h-2.5 w-2.5" />
                            {v.activePriceType.label}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        {v.isOnSale && v.effectivePriceUsd != null && v.effectivePriceUsd < v.priceUsd ? (
                          <>
                            <span className="line-through text-slate-400">{formatUsd(v.priceUsd)}</span>
                            <span className="font-bold text-slate-900">{formatUsd(v.effectivePriceUsd)}</span>
                          </>
                        ) : (
                          <span className="font-medium text-slate-900">{formatUsd(v.priceUsd)}</span>
                        )}
                        {v.floorPriceUsd != null && v.floorPriceUsd > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <ShieldCheck className="h-2.5 w-2.5" /> Floor {formatUsd(v.floorPriceUsd)}
                          </span>
                        )}
                        <span>· <Eye className="inline h-3 w-3" aria-hidden /> {v.views}</span>
                        <span className="hidden sm:inline">· {timeAgo(v.createdAt, locale)}</span>
                      </p>
                    </button>
                    <VehicleStatusBadge status={v.status} />
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200 cursor-pointer"
                        onClick={() => setPromoVehicle(v)}
                        aria-label={`Promo — ${v.make} ${v.model}`}
                      >
                        <Flame className="h-3.5 w-3.5 text-amber-600 mr-1" />
                        <span className="text-xs font-semibold">Promo</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 cursor-pointer"
                        onClick={() => {
                          setEditorId(v.id);
                          setEditorOpen(true);
                        }}
                        aria-label={`${t("actEditListing")} — ${v.make} ${v.model}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        <span className="ml-1.5 hidden sm:inline">{t("actEditListing")}</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {sorted.length > 0 && (
                <div className="mt-4">
                  <Pagination
                    page={currentPage}
                    pageCount={pageCount}
                    onPageChange={setPage}
                    pageSize={pageSize}
                    onPageSizeChange={(sz) => {
                      setPageSize(sz);
                      setPage(1);
                    }}
                    totalItems={sorted.length}
                  />
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <ListingEditorDialog
        vehicleId={editorId}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) refetch();
        }}
      />

      <SellerPromoModal
        vehicle={promoVehicle}
        onClose={() => setPromoVehicle(null)}
        onSaved={refetch}
      />
    </>
  );
}

function SellerPromoModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: MyListingRowDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const [submitting, setSubmitting] = useState(false);
  const { data: promoTypesData } = useFetch<{
    types: { id: string; code: string; label: string; mode: string; badgeColor: string; priority: number }[];
  }>("/api/seller/pricing/available-types");
  const priceTypes = promoTypesData?.types ?? [];

  const [priceTypeId, setPriceTypeId] = useState("");
  const [value, setValue] = useState("10");
  const [floorPrice, setFloorPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (vehicle) {
      setFloorPrice(vehicle.floorPriceUsd ? String(vehicle.floorPriceUsd) : "");
      if (priceTypes.length > 0 && !priceTypeId) {
        setPriceTypeId(priceTypes[0].id);
      }
    }
  }, [vehicle, priceTypes]);

  const selectedType = useMemo(
    () => priceTypes.find((p) => p.id === priceTypeId) ?? priceTypes[0],
    [priceTypes, priceTypeId]
  );

  const preview = useMemo(() => {
    if (!vehicle) return null;
    const base = vehicle.priceUsd;
    const floor = floorPrice ? Number(floorPrice) : null;
    const promoVal = Number(value) || 0;

    let candidate = base;
    if (selectedType && promoVal > 0) {
      if (selectedType.mode === "PERCENT") {
        candidate = Math.round(base * (1 - Math.min(promoVal, 100) / 100));
      } else {
        if (promoVal < base) {
          candidate = Math.round(promoVal);
        }
      }
    }

    const floorClamped = floor != null && floor > 0 && candidate < floor;
    const effective = floorClamped ? (floor as number) : candidate;
    const discountUsd = Math.max(0, base - effective);
    const discountPercent = base > 0 ? Math.round((discountUsd / base) * 100) : 0;

    return {
      base,
      candidate,
      effective,
      floor,
      floorClamped,
      discountUsd,
      discountPercent,
    };
  }, [vehicle, selectedType, value, floorPrice]);

  const handleSave = async () => {
    if (!vehicle) return;
    const val = Number(value);
    if (!val || val <= 0) {
      toast.warning(t("dealerPricingEnterDiscountToast"));
      return;
    }

    setSubmitting(true);
    try {
      await apiSend("/api/seller/pricing/item", "POST", {
        vehicleId: vehicle.id,
        priceTypeId: priceTypeId || priceTypes[0]?.id,
        value: val,
        floorPriceUsd: floorPrice ? Number(floorPrice) : null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
      });
      toast.success(t("dealerPricingPromoAppliedToast", { vehicle: `${vehicle.make} ${vehicle.model}` }));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingUpdatePricingFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!vehicle) return;
    setSubmitting(true);
    try {
      await apiSend(`/api/seller/pricing/item?vehicleId=${vehicle.id}`, "DELETE");
      toast.success(t("dealerPricingPromoRemovedToast"));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingRemovePromoFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!vehicle) return null;

  return (
    <Dialog open={Boolean(vehicle)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Flame className="h-5 w-5 text-amber-600" />
            {t("dealerPricingSingleTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center gap-3">
            <div className="h-10 w-14 shrink-0 rounded-lg overflow-hidden bg-slate-200">
              {vehicle.images[0] ? (
                <img src={vehicle.images[0]} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {vehicle.make} {vehicle.model} {vehicle.variant || ""} {vehicle.year}
              </p>
              <p className="text-xs text-slate-500">
                {t("dealerPricingSingleBasePrice")}: <span className="font-semibold text-slate-800">{formatUsd(vehicle.priceUsd)}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">{t("pricingBasePriceLabel")}</Label>
              <Input disabled value={formatUsd(vehicle.priceUsd)} className="mt-1.5 bg-slate-100 font-bold" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">{t("dealerPricingFloorProtectionLabel")}</Label>
              <Input
                type="number"
                min={0}
                value={floorPrice}
                onChange={(e) => setFloorPrice(e.target.value)}
                placeholder="e.g. 16500"
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600">{t("pricingPromoTypeLabel")}</Label>
            <div className="mt-1.5">
              <Select value={priceTypeId} onValueChange={setPriceTypeId}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder={t("dealerPricingSelectTierPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {priceTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {getPromoTierLabel(pt, locale)} ({pt.mode === "PERCENT" ? "% off" : "Fixed $"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-600">
              {selectedType?.mode === "PERCENT" ? t("pricingDiscountPercent") : t("dealerPricingTargetPriceLabel")}
            </Label>
            <Input
              type="number"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={selectedType?.mode === "PERCENT" ? "10" : "17500"}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">{t("pricingStartDateOpt")}</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">{t("pricingEndDateOpt")}</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1.5 h-9 text-xs"
              />
            </div>
          </div>

          {/* Real-time Preview */}
          {preview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{t("dealerPricingResolutionPreview")}</span>
                {preview.discountUsd > 0 && (
                  <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                    {t("dealerPricingSaveAmount", { amount: formatUsd(preview.discountUsd), percent: preview.discountPercent })}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                {preview.discountUsd > 0 && (
                  <span className="text-xs text-slate-400 line-through">
                    {formatUsd(preview.base)}
                  </span>
                )}
                <span className="text-xl font-black text-slate-900">
                  {formatUsd(preview.effective)}
                </span>
                {selectedType && (
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs"
                    style={{ backgroundColor: selectedType.badgeColor || "#ef4444" }}
                  >
                    {getPromoTierLabel(selectedType, locale)}
                  </span>
                )}
              </div>

              {preview.floorClamped && (
                <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 font-medium">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    {t("dealerPricingFloorEnforcedDetail", {
                      candidate: formatUsd(preview.candidate),
                      floor: formatUsd(preview.floor || 0)
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2">
          {vehicle.isOnSale ? (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={submitting}
              className="text-rose-600 hover:text-rose-700 border-rose-200"
            >
              {t("dealerPricingClearPromoBtn")}
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("pricingCancelBtn")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("dealerPricingSavePricingBtn")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- subscription (free trial) ----------------

const SELLER_PLANS: PlanDTO[] = [
  {
    plan: "STARTER",
    name: "Starter Plan",
    priceUsdMonthly: 9,
    priceUsdYearly: 90,
    listingsLimit: 5,
    featuredLimit: 1,
    seats: 1,
    features: [{ en: "Up to 5 active vehicle listings", km: "ការដាក់លក់រថយន្តសកម្មរហូតដល់ ៥" }],
  },
  {
    plan: "BASIC",
    name: "Basic Plan",
    priceUsdMonthly: 29,
    priceUsdYearly: 290,
    listingsLimit: 15,
    featuredLimit: 3,
    seats: 2,
    features: [{ en: "Up to 15 car listings", km: "រថយន្តរហូតដល់ ១៥ គ្រឿង" }],
  },
  {
    plan: "PRO",
    name: "Professional Plan",
    priceUsdMonthly: 59,
    priceUsdYearly: 590,
    listingsLimit: 50,
    featuredLimit: 10,
    seats: 5,
    features: [{ en: "Up to 50 car listings", km: "រថយន្តរហូតដល់ ៥០ គ្រឿង" }],
  },
  {
    plan: "ENTERPRISE",
    name: "Enterprise Dealership",
    priceUsdMonthly: 149,
    priceUsdYearly: 1490,
    listingsLimit: 1000,
    featuredLimit: 30,
    seats: 20,
    features: [{ en: "Unlimited car listings", km: "រថយន្តមិនកំណត់" }],
  },
];

export function SellerSubscription() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const sub = useFetch<SellerSubscriptionDTO>("/api/seller/subscription");
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [requesting, setRequesting] = useState<PlanDTO | null>(null);
  const [verifiedAlert, setVerifiedAlert] = useState<string | null>(null);

  useEffect(() => {
    const alertPlan = sessionStorage.getItem("subscription_verified_alert");
    if (alertPlan) {
      setVerifiedAlert(alertPlan);
      sessionStorage.removeItem("subscription_verified_alert");
      toast.success(`🎉 Processing Completed! Your ${alertPlan} subscription is now ACTIVE.`);
    }
  }, []);

  if (sub.loading && !sub.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (sub.error && !sub.data) return <FetchErrorState message={sub.error} onRetry={sub.refetch} />;
  const s = sub.data;
  if (!s) return null;

  const usedPct = Math.max(
    0,
    Math.min(100, Math.round(((s.freeTrialDays - s.daysLeft) / Math.max(1, s.freeTrialDays)) * 100)),
  );
  const active = s.status === "ACTIVE";

  return (
    <>
      {verifiedAlert && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-4 shadow-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white font-extrabold text-[10px] tracking-wide uppercase px-2 py-0.5">
                  Processing Completed
                </Badge>
                <h4 className="text-sm font-bold text-emerald-950">
                  🎉 {verifiedAlert} Subscription Active!
                </h4>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                Your payment was approved and verified. All features are now unlocked!
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVerifiedAlert(null)}
            className="h-8 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950 cursor-pointer"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="mb-4">
        <PendingPaymentBanner />
      </div>

      <SectionCard
        title={t("tabSubscription")}
        action={
          <Badge
            className={cn(
              "font-semibold",
              active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700",
            )}
            variant="outline"
          >
            {active ? t("subTrialActive") : t("subTrialExpired")}
          </Badge>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <CreditCard className="h-5 w-5 text-amber-600" aria-hidden />
              {t("subFreeTrialTitle")}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("subTrialPlanHint")}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-bold", active ? "text-emerald-600" : "text-rose-600")}>
              {active ? t("subTrialDaysLeft", { n: s.daysLeft }) : t("subTrialExpiredShort")}
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-400">
              <CalendarClock className="h-3 w-3" aria-hidden />
              {t("subTrialEnds", { date: formatDateTime(s.currentPeriodEnd, locale) })}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>{t("subTrialProgress")}</span>
            <span>{usedPct}%</span>
          </div>
          <Progress value={usedPct} aria-label={t("subTrialProgress")} className="h-2" />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
            <span>{t("subTrialStarted", { date: formatDateTime(s.startedAt, locale) })}</span>
            <span>{t("subTrialLength", { n: s.freeTrialDays })}</span>
          </div>
        </div>
      </SectionCard>

      {!active && (
        <div className="space-y-4">
          <SubscriptionPaywallCard
            role="SELLER"
            onActivated={() => {
              sub.refetch();
            }}
          />
          <TenantPaymentHistory />
        </div>
      )}

      <RequestSubscriptionDialog
        open={requesting !== null}
        onOpenChange={(o) => { if (!o) setRequesting(null); }}
        plan={requesting}
        cycle={cycle}
        priceUsd={requesting ? (cycle === "YEARLY" ? requesting.priceUsdYearly : requesting.priceUsdMonthly) : 0}
        onDone={() => {
          sub.refetch();
          setRequesting(null);
        }}
      />

      <SectionCard title={t("subWhatNextTitle")}>
        <ul className="space-y-2.5 text-xs leading-relaxed text-slate-600">
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            {t("subWhatNextKeep")}
          </li>
          <li className="flex items-start gap-2">
            <CarFront className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            {t("subWhatNextDealer")}
          </li>
          <li className="flex items-start gap-2">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            {t("subWhatNextPlans")}
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-slate-400">{t("subTrialAdminNote")}</p>
      </SectionCard>
    </>
  );
}
