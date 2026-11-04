"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { MetaDTO } from "@/lib/types";
import type { MyListingRowDTO } from "@/lib/listing-types";
import type { TenantBranchDTO } from "@/lib/dashboard-types";
import { GuestPanel } from "@/components/marketplace/guest-panel";
import {
  PhotoUploader, DocumentsEditor, ListingEditorDialog, type DocumentRow,
} from "@/components/marketplace/listing-editor";
import { VehicleStatusBadge } from "@/components/marketplace/dashboard/bits";
import { SubscriptionPaywallCard } from "@/components/marketplace/dashboard/payment-flow";
import { Pagination } from "@/components/marketplace/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarFront, Check, ChevronDown, ChevronUp, Eye, Loader2, Pencil, PhoneCall, Plus, Sparkles, TriangleAlert, Flame, ShieldCheck, Calendar, DollarSign, Tag, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUsd, formatKhr } from "@/lib/format";
import {
  getCompatibleVehicleModels,
  getPartManufacturers,
  getPartModels,
  getVehicleMakes,
  getVehicleModels,
} from "@/lib/vehicle-catalog";

import {
  bodyTypeLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
  partConditionLabels,
  partTargetLabels,
  fuelLabels,
  transmissionLabels,
  drivetrainLabels,
} from "@/lib/i18n";

// Sample photo pool for the demo (hosted on Cloudflare R2)
const SAMPLE_PHOTOS = [
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/prado/prado_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/lexus/lexus_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/revo/revo_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/crv/crv_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/camry/camry_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/ranger/ranger_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/cclass/cclass_1.jpg",
  "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev/seed/vehicles/cx5/cx5_1.jpg",
];

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"];
const MOTOR_BODY_TYPES = ["SCOOTER", "CUB", "SPORT", "CRUISER", "DIRT", "ELECTRIC", "OTHER"];
const PART_CATEGORIES = [
  "TIRES_WHEELS",
  "BRAKES_SUSPENSION",
  "BATTERY_ELECTRICAL",
  "ENGINE_TRANSMISSION",
  "LIGHTS_BULBS",
  "BODY_MIRRORS",
  "OILS_LUBRICANTS",
  "ACCESSORIES",
];
const PART_CONDITIONS = ["BRAND_NEW", "USED_GENUINE", "AFTERMARKET"];
const PART_TARGETS = ["CAR", "MOTOR", "UNIVERSAL"];
const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];
const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];
const IMPORTS = ["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"];
const ACCIDENTS = ["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"];

interface SellForm {
  branchId?: string;
  listingCategory: "CAR" | "MOTOR" | "SPARE_PART";
  partCategory: string;
  partTarget: string;
  partCondition: string;
  compatibleModels: string;
  partNumber: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  mileageKm: string;
  bodyType: string;
  fuel: string;
  transmission: string;
  engineCc: string;
  drivetrain: string;
  images: string[];
  documents: DocumentRow[];
  condition: string;
  accidentDeclared: string;
  ownershipCount: string;
  vinLast6: string;
  plateNo: string;
  importOrigin: string;
  priceUsd: string;
  priceMasked: boolean;
  floorPriceUsd: string;
  launchPromo: boolean;
  promoPriceTypeId: string;
  promoValue: string;
  promoStartDate: string;
  promoEndDate: string;
  seats: string;
  interiorColor: string;
  fuelEconomy: string;
  city: string;
  district: string;
  description: string;
  descriptionKm: string;
}

const EMPTY: SellForm = {
  branchId: "",
  listingCategory: "CAR",
  partCategory: "TIRES_WHEELS",
  partTarget: "CAR",
  partCondition: "BRAND_NEW",
  compatibleModels: "",
  partNumber: "",
  make: "", model: "", variant: "", year: "", mileageKm: "", bodyType: "SEDAN", fuel: "PETROL", transmission: "AUTOMATIC",
  engineCc: "", drivetrain: "", images: [], documents: [], condition: "USED", accidentDeclared: "UNKNOWN",
  ownershipCount: "", vinLast6: "", plateNo: "", importOrigin: "", priceUsd: "", priceMasked: false,
  floorPriceUsd: "", launchPromo: false, promoPriceTypeId: "", promoValue: "", promoStartDate: "", promoEndDate: "",
  seats: "", interiorColor: "", fuelEconomy: "", city: "Phnom Penh",
  district: "", description: "", descriptionKm: "",
};

export function SellView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
  const { data: meta } = useFetch<MetaDTO>("/api/meta");
  const { data: branchData } = useFetch<{ branches: TenantBranchDTO[] }>(
    me?.tenant ? "/api/tenant/branches" : null
  );
  const branches = branchData?.branches ?? [];
  const { data: promoTypesData } = useFetch<{
    types: { id: string; code: string; label: string; mode: string; badgeColor: string; priority: number }[];
  }>("/api/seller/pricing/available-types");
  const availablePriceTypes = useMemo(() => promoTypesData?.types ?? [], [promoTypesData]);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SellForm>(EMPTY);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (patch: Partial<SellForm>) => setForm((f) => ({ ...f, ...patch }));

  // Sample photos are a convenience quick-pick — toggle in/out of the listing.
  const toggleImage = (url: string) => {
    setForm((f) => ({
      ...f,
      images: f.images.includes(url)
        ? f.images.filter((i) => i !== url)
        : [...f.images, url],
    }));
  };

  const isStaff = Boolean(me && (me.user.role === "ADMIN" || me.user.role === "SUPER_ADMIN"));
  const canSellParts = isStaff || Boolean(me?.subscription?.status === "ACTIVE" && (me?.subscription?.plan === "PRO" || me?.subscription?.plan === "ENTERPRISE"));

  const selectedPromoType = useMemo(
    () => availablePriceTypes.find((t) => t.id === form.promoPriceTypeId),
    [availablePriceTypes, form.promoPriceTypeId]
  );

  const pricingPreview = useMemo(() => {
    const base = Number(form.priceUsd) || 0;
    const floor = form.floorPriceUsd ? Number(form.floorPriceUsd) : null;
    const promoVal = Number(form.promoValue) || 0;

    let candidate = base;
    if (form.launchPromo && selectedPromoType && promoVal > 0) {
      if (selectedPromoType.mode === "PERCENT") {
        const clampedPercent = Math.min(Math.max(promoVal, 0), 100);
        candidate = Math.round(base * (1 - clampedPercent / 100));
      } else {
        if (promoVal < base) {
          candidate = Math.round(promoVal);
        }
      }
    }

    const floorClamped = floor !== null && floor > 0 && candidate < floor;
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
      isOnSale: Boolean(form.launchPromo && selectedPromoType && discountUsd > 0),
    };
  }, [form.priceUsd, form.floorPriceUsd, form.promoValue, form.launchPromo, selectedPromoType]);

  const validateStep = (): string | null => {
    if (step === 1) {
      if (form.listingCategory === "SPARE_PART") {
        if (!canSellParts) {
          return t("sparePartsProRequired");
        }
        if (!form.make.trim()) return t("flowBrandRequired");
        if (!form.model.trim()) return t("flowPartNameRequired");
        if (!form.partCategory) return t("flowPartCategoryRequired");
      } else if (form.listingCategory === "MOTOR") {
        if (!form.make.trim()) return t("flowMakeRequired");
        if (!form.model.trim()) return t("flowModelRequired");
        const y = Number(form.year);
        if (!y || y < 1980 || y > 2026) return t("flowYearInvalid");
        if (!form.bodyType) return t("flowMotorTypeRequired");
      } else {
        // CAR
        if (!form.make.trim()) return t("flowMakeRequired");
        if (!form.model.trim()) return t("flowModelRequired");
        const y = Number(form.year);
        if (!y || y < 1990 || y > 2026) return t("flowYearInvalid");
        if (!form.bodyType || !form.fuel || !form.transmission)
          return t("flowCarDetailsRequired");
        const m = Number(form.mileageKm);
        if (Number.isNaN(m) || m < 0) return t("flowMileageInvalid");
      }
    }
    if (step === 2) {
      if (form.images.length === 0)
        return t("flowPhotoRequired");
    }
    if (step === 3) {
      if (!form.priceMasked) {
        const p = Number(form.priceUsd);
        if (!p || p <= 0) return t("flowPriceRequired");
      }
      if (form.floorPriceUsd) {
        const fp = Number(form.floorPriceUsd);
        const p = Number(form.priceUsd);
        if (fp < 0) return "Floor price cannot be negative";
        if (p > 0 && fp > p) return "Floor price cannot exceed the base listing price";
      }
      if (form.launchPromo) {
        if (!form.promoPriceTypeId) return "Please select a promotional tier";
        const pv = Number(form.promoValue);
        if (!pv || pv <= 0) return "Please enter a valid promotional discount value";
        if (selectedPromoType?.mode === "PERCENT" && pv >= 100) {
          return "Discount percentage must be less than 100%";
        }
        if (selectedPromoType?.mode === "FIXED" && pv >= Number(form.priceUsd)) {
          return "Promotional fixed price must be lower than the base price";
        }
      }
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) {
      toast.warning(err);
      return;
    }
    if (step < 3) setStep(step + 1);
    else submit();
  };

  const submit = async () => {
    const validationError = validateStep();
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const isPart = form.listingCategory === "SPARE_PART";
      const isMotor = form.listingCategory === "MOTOR";

      const res = await apiSend<{ vehicle: { id: string } }>("/api/vehicles", "POST", {
        listingCategory: form.listingCategory,
        partCategory: isPart ? form.partCategory : undefined,
        partTarget: isPart ? form.partTarget : undefined,
        partCondition: isPart ? form.partCondition : undefined,
        compatibleModels: isPart ? (form.compatibleModels.trim() || undefined) : undefined,
        partNumber: isPart ? (form.partNumber.trim() || undefined) : undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        variant: form.variant.trim() || undefined,
        year: isPart ? (Number(form.year) || new Date().getFullYear()) : Number(form.year),
        priceUsd: Number(form.priceUsd) || 0,
        priceMasked: form.priceMasked,
        mileageKm: isPart ? 0 : Math.round(Number(form.mileageKm) || 0),
        transmission: isPart ? "AUTOMATIC" : form.transmission,
        fuel: isPart ? "PETROL" : form.fuel,
        bodyType: isPart ? "PART" : form.bodyType,
        engineCc: form.engineCc ? Number(form.engineCc) : undefined,
        drivetrain: !isPart && !isMotor ? (form.drivetrain || undefined) : undefined,
        seats: !isPart && !isMotor && form.seats ? Number(form.seats) : undefined,
        interiorColor: !isPart && !isMotor ? (form.interiorColor.trim() || undefined) : undefined,
        fuelEconomy: !isPart && !isMotor ? (form.fuelEconomy.trim() || undefined) : undefined,
        exteriorColor: undefined,
        condition: isPart ? (form.partCondition === "BRAND_NEW" ? "LIKE_NEW" : "USED") : form.condition,
        accidentDeclared: isPart ? "NONE_DECLARED" : form.accidentDeclared,
        city: form.city || "Phnom Penh",
        district: form.district.trim() || undefined,
        description: form.description.trim() || undefined,
        descriptionKm: form.descriptionKm.trim() || undefined,
        vinLast6: !isPart && form.vinLast6.trim() ? form.vinLast6.trim().slice(0, 6) : undefined,
        plateNo: !isPart && form.plateNo.trim() ? form.plateNo.trim() : undefined,
        ownershipCount: !isPart && form.ownershipCount ? Number(form.ownershipCount) : undefined,
        importOrigin: !isPart && form.importOrigin ? form.importOrigin : undefined,
        branchId: form.branchId || undefined,
        images: form.images,
        ...(form.documents.length > 0
          ? {
              documents: form.documents.map((d) => ({
                type: d.type,
                status: d.status,
                notes: d.notes.trim() || null,
                fileUrl: d.fileUrl,
              })),
            }
          : {}),
      });

      // Attach floor price and/or promotional pricing if provided
      if (res?.vehicle?.id) {
        const vId = res.vehicle.id;
        if (form.launchPromo && form.promoPriceTypeId && form.promoValue) {
          try {
            await apiSend("/api/seller/pricing/item", "POST", {
              vehicleId: vId,
              priceTypeId: form.promoPriceTypeId,
              value: Number(form.promoValue),
              floorPriceUsd: form.floorPriceUsd ? Number(form.floorPriceUsd) : undefined,
              startDate: form.promoStartDate ? new Date(form.promoStartDate).toISOString() : undefined,
              endDate: form.promoEndDate ? new Date(form.promoEndDate).toISOString() : undefined,
            });
          } catch (promoErr) {
            console.error("Failed to attach promotional tier:", promoErr);
          }
        } else if (form.floorPriceUsd) {
          try {
            await apiSend("/api/seller/pricing/item", "PATCH", {
              vehicleId: vId,
              floorPriceUsd: Number(form.floorPriceUsd),
            });
          } catch (floorErr) {
            console.error("Failed to update floor price:", floorErr);
          }
        }
      }

      toast.success(t("sellSuccess"));
      navigate({ name: "detail", vehicleId: res.vehicle.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [t("step1Title"), t("step2Title"), t("step3Title")];

  // Selling is an account action — guests get the register prompt, the public
  // can still browse every listing freely.
  if (!me || isGuest(me)) {
    return <GuestPanel icon={<CarFront className="h-6 w-6" aria-hidden />} />;
  }

  const hasActiveSub = me.subscription?.status === "ACTIVE";

  if (!isStaff && !hasActiveSub) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 pb-28 md:pb-10 space-y-4">
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/80 p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold shadow-xs">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">
                {t("flowSubscriptionRequired")}
              </h2>
              <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                {t("flowSubscriptionRequiredDesc")}
              </p>
            </div>
          </div>
        </div>

        <SubscriptionPaywallCard
          role={me.user.role === "DEALER" ? "DEALER" : "SELLER"}
          onActivated={() => {
            window.location.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("sellTitle")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("sellSubtitle")}</p>
      <p className="mt-1 text-xs text-slate-400">{t("formPhoneNote")}</p>

      {/* Step indicator */}
      <ol className="mt-5 flex items-center gap-2" aria-label={t("step1Of", { n: step })}>
        {[1, 2, 3].map((s) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                s < step ? "bg-emerald-500 text-white" : s === step ? "bg-amber-500 text-slate-950" : "bg-slate-200 text-slate-500"
              )}
              aria-current={s === step ? "step" : undefined}
            >
              {s < step ? <Check className="h-4 w-4" aria-hidden /> : s}
            </span>
            <span className={cn("hidden sm:block text-xs font-medium", s === step ? "text-slate-900" : "text-slate-400")}>
              {stepTitles[s - 1]}
            </span>
            {s < 3 && <span className={cn("h-0.5 flex-1 rounded", s < step ? "bg-emerald-400" : "bg-slate-200")} />}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-400 sm:hidden">
        {t("step1Of", { n: step })} — {stepTitles[step - 1]}
      </p>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        {/* STEP 1 — details */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Category Selector Tabs */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t("flowFormCategory")}</Label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => set({ listingCategory: "CAR", bodyType: "SEDAN" })}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    form.listingCategory === "CAR"
                      ? "bg-white text-slate-950 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-950 hover:bg-white/50"
                  )}
                >
                  <span className="text-base">🚗</span>
                  <span>{t("categoryCars")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => set({ listingCategory: "MOTOR", bodyType: "SCOOTER", fuel: "PETROL", transmission: "AUTOMATIC" })}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    form.listingCategory === "MOTOR"
                      ? "bg-white text-slate-950 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-950 hover:bg-white/50"
                  )}
                >
                  <span className="text-base">🏍️</span>
                  <span>{t("categoryMotors")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => set({ listingCategory: "SPARE_PART" })}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer relative",
                    form.listingCategory === "SPARE_PART"
                      ? "bg-white text-slate-950 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-950 hover:bg-white/50"
                  )}
                >
                  <span className="text-base">⚙️</span>
                  <span>{t("categorySpareParts")}</span>
                  {!canSellParts && (
                    <span className="text-[10px] px-1 rounded bg-amber-200 text-amber-900 font-bold border border-amber-300">
                      Pro
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Spare Parts Plan Gating Warning Banner */}
            {form.listingCategory === "SPARE_PART" && !canSellParts && (
              <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold text-lg shadow-xs">
                    ⚙️
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-slate-950">
                      {t("sparePartsProRequired")}
                    </h4>
                    <p className="mt-0.5 text-xs text-amber-900 leading-relaxed">
                      {t("sparePartsProRequiredDesc")}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => navigate({ name: "plans" } as any)}
                        className="bg-slate-950 text-white hover:bg-slate-800 text-xs font-semibold h-8"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                        {t("upgradeNow")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => set({ listingCategory: "CAR" })}
                        className="text-xs h-8 border-amber-300 hover:bg-amber-100 text-slate-800"
                      >
                        {t("flowSellCarInstead")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SPARE PART FIELDS */}
            {form.listingCategory === "SPARE_PART" && canSellParts && (
              <div className="space-y-4">
                <Field label={t("partTarget")}>
                  <div className="grid grid-cols-3 gap-2">
                    {PART_TARGETS.map((tgt) => (
                      <button
                        key={tgt}
                        type="button"
                        onClick={() => set({ partTarget: tgt })}
                        className={cn(
                          "py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors text-center",
                          form.partTarget === tgt
                            ? "border-amber-500 bg-amber-50 text-amber-900 font-bold shadow-xs"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {partTargetLabels[tgt]?.[locale] ?? tgt}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t("partCategoryLabel")}>
                    <SelectInput
                      value={form.partCategory}
                      onChange={(v) => set({ partCategory: v })}
                      options={PART_CATEGORIES.map((pc) => ({
                        value: pc,
                        label: partCategoryLabels[pc]?.[locale] ?? pc,
                      }))}
                      placeholder={t("partCategoryLabel")}
                    />
                  </Field>
                  <Field label={t("partConditionLabel")}>
                    <SelectInput
                      value={form.partCondition}
                      onChange={(v) => set({ partCondition: v })}
                      options={PART_CONDITIONS.map((cond) => ({
                        value: cond,
                        label: partConditionLabels[cond]?.[locale] ?? cond,
                      }))}
                      placeholder={t("partConditionLabel")}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t("flowPartBrand")}>
                    <Input
                      value={form.make}
                      onChange={(e) => set({ make: e.target.value })}
                      placeholder={t("flowBrandPlaceholder")}
                      list="kl-sell-part-makes"
                    />
                    <datalist id="kl-sell-part-makes">
                      {getPartManufacturers(meta?.makes).map((make) => <option key={make} value={make} />)}
                    </datalist>
                  </Field>
                  <Field label={t("flowPartName")}>
                    <Input
                      value={form.model}
                      onChange={(e) => set({ model: e.target.value })}
                      placeholder={t("flowPartName")}
                      list="kl-sell-part-models"
                    />
                    <datalist id="kl-sell-part-models">
                      {getPartModels().map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t("compatibleModelsLabel")} hint={t("flowCompatibleModelsHint")}>
                    <Input
                      value={form.compatibleModels}
                      onChange={(e) => set({ compatibleModels: e.target.value })}
                      placeholder={t("compatibleModelsPlaceholder")}
                      list="kl-sell-compatible-models"
                    />
                    <datalist id="kl-sell-compatible-models">
                      {getCompatibleVehicleModels(form.partTarget).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("partNumberLabel")} hint={t("flowPartNumberHint")}>
                    <Input
                      value={form.partNumber}
                      onChange={(e) => set({ partNumber: e.target.value })}
                      placeholder={t("partNumberPlaceholder")}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* MOTORCYCLE FIELDS */}
            {form.listingCategory === "MOTOR" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("formMake")}>
                    <Input
                      value={form.make}
                      onChange={(e) => set({ make: e.target.value })}
                      placeholder={t("flowMotorcycleBrandPlaceholder")}
                      list="kl-sell-motor-makes"
                    />
                    <datalist id="kl-sell-motor-makes">
                      {getVehicleMakes("MOTOR", meta?.makes).map((make) => (
                        <option key={make} value={make} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("formModel")}>
                    <Input
                      value={form.model}
                      onChange={(e) => set({ model: e.target.value })}
                      placeholder="e.g. Dream 125, Scoopy, PCX 160"
                      list="kl-sell-motor-models"
                    />
                    <datalist id="kl-sell-motor-models">
                      {getVehicleModels("MOTOR", form.make).map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </Field>
                  <Field label={t("formYear")}>
                    <Input
                      type="number"
                      min={1980}
                      max={2026}
                      value={form.year}
                      onChange={(e) => set({ year: e.target.value })}
                      placeholder="2024"
                    />
                  </Field>
                  <Field label={t("specMileage")}>
                    <Input
                      type="number"
                      min={form.priceMasked ? 0 : 1}
                      value={form.mileageKm}
                      onChange={(e) => set({ mileageKm: e.target.value })}
                      placeholder="5000"
                    />
                  </Field>
                </div>

                <Field label={t("motorBodyType")}>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTOR_BODY_TYPES.map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => set({ bodyType: bt })}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                          form.bodyType === bt ? "border-amber-500 bg-amber-50 text-amber-700 font-bold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                        aria-pressed={form.bodyType === bt}
                      >
                        {motorBodyTypeLabels[bt]?.[locale] ?? bt}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label={t("engineDisplacement")}>
                    <Input
                      type="number"
                      min={50}
                      max={2500}
                      value={form.engineCc}
                      onChange={(e) => set({ engineCc: e.target.value })}
                      placeholder="125"
                    />
                  </Field>
                  <Field label={t("formTransmission")}>
                    <SelectInput
                      value={form.transmission}
                      onChange={(v) => set({ transmission: v })}
                      options={[
                        { value: "AUTOMATIC", label: transmissionLabels.AUTOMATIC[locale] },
                        { value: "MANUAL", label: transmissionLabels.MANUAL[locale] },
                      ]}
                      placeholder={t("formTransmission")}
                    />
                  </Field>
                  <Field label={t("formFuel")}>
                    <SelectInput
                      value={form.fuel}
                      onChange={(v) => set({ fuel: v })}
                      options={[
                        { value: "PETROL", label: fuelLabels.PETROL[locale] },
                        { value: "ELECTRIC", label: fuelLabels.ELECTRIC[locale] },
                      ]}
                      placeholder={t("formFuel")}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* CAR FIELDS */}
            {form.listingCategory === "CAR" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("formMake")}>
                    <Input value={form.make} onChange={(e) => set({ make: e.target.value })} placeholder="Toyota" list="kl-sell-car-makes" />
                    <datalist id="kl-sell-car-makes">
                      {getVehicleMakes("CAR", meta?.makes).map((make) => (
                        <option key={make} value={make} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("formModel")}>
                    <Input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="Land Cruiser Prado" list="kl-sell-car-models" />
                    <datalist id="kl-sell-car-models">
                      {getVehicleModels("CAR", form.make).map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </Field>
                  <Field label={t("formVariant")}>
                    <Input value={form.variant} onChange={(e) => set({ variant: e.target.value })} placeholder="TX-L" />
                  </Field>
                  <Field label={t("formYear")}>
                    <Input type="number" min={1990} max={2026} value={form.year} onChange={(e) => set({ year: e.target.value })} placeholder="2019" />
                  </Field>
                  <Field label={t("specMileage")}>
                    <Input type="number" min={0} value={form.mileageKm} onChange={(e) => set({ mileageKm: e.target.value })} placeholder="85000" />
                  </Field>
                </div>
                <Field label={t("formBodyType")}>
                  <div className="flex flex-wrap gap-1.5">
                    {BODY_TYPES.map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => set({ bodyType: bt })}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                          form.bodyType === bt ? "border-amber-500 bg-amber-50 text-amber-700 font-bold" : "border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                        aria-pressed={form.bodyType === bt}
                      >
                        {bodyTypeLabels[bt]?.[locale] ?? bt}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("formFuel")}>
                    <SelectInput
                      value={form.fuel}
                      onChange={(v) => set({ fuel: v })}
                      options={FUELS.map((f) => ({ value: f, label: fuelLabels[f]?.[locale] ?? f }))}
                      placeholder={t("formFuel")}
                    />
                  </Field>
                  <Field label={t("formTransmission")}>
                    <SelectInput
                      value={form.transmission}
                      onChange={(v) => set({ transmission: v })}
                      options={TRANSMISSIONS.map((tr) => ({ value: tr, label: transmissionLabels[tr]?.[locale] ?? tr }))}
                      placeholder={t("formTransmission")}
                    />
                  </Field>
                  <Field label={t("formEngine")}>
                    <Input type="number" min={600} value={form.engineCc} onChange={(e) => set({ engineCc: e.target.value })} placeholder="2500" />
                  </Field>
                  <Field label={t("formDrivetrain")}>
                    <SelectInput
                      value={form.drivetrain}
                      onChange={(v) => set({ drivetrain: v })}
                      options={DRIVETRAINS.map((d) => ({ value: d, label: drivetrainLabels[d]?.[locale] ?? d }))}
                      placeholder="—"
                    />
                  </Field>
                </div>

                {/* Optional Core Specs Pack Toggle */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowMoreInfo(!showMoreInfo)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100/80 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors cursor-pointer"
                  >
                    {showMoreInfo ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {showMoreInfo ? t("hideMoreInfo") : t("addMoreInfo")}
                  </button>

                  {showMoreInfo && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 animate-in fade-in slide-in-from-top-1">
                      <Field label={t("specSeats")} hint={t("flowSeatsHint")}>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={form.seats}
                          onChange={(e) => set({ seats: e.target.value })}
                          placeholder="5"
                        />
                      </Field>
                      <Field label={t("specInteriorColor")} hint={t("flowInteriorColorHint")}>
                        <Input
                          value={form.interiorColor}
                          onChange={(e) => set({ interiorColor: e.target.value })}
                          placeholder={t("flowInteriorColorPlaceholder")}
                        />
                      </Field>
                      <Field label={t("specFuelEconomy")} hint={t("flowFuelEconomyHint")}>
                        <Input
                          value={form.fuelEconomy}
                          onChange={(e) => set({ fuelEconomy: e.target.value })}
                          placeholder={t("specFuelEconomyPlaceholder")}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — photos & condition */}
        {step === 2 && (
          <div className="space-y-5">
            <Field label={t("formPhotos")} hint={t("formPhotosHint")}>
              <PhotoUploader images={form.images} onChange={(images) => set({ images })} disabled={submitting} />
            </Field>
            <Field label={t("samplePhotos")}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {SAMPLE_PHOTOS.map((url) => {
                  const selected = form.images.includes(url);
                  const idx = form.images.indexOf(url);
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => toggleImage(url)}
                      className={cn(
                        "relative aspect-[4/3] overflow-hidden rounded-lg border-2 cursor-pointer transition-all",
                        selected ? "border-amber-500" : "border-transparent opacity-70 hover:opacity-100"
                      )}
                      aria-pressed={selected}
                      aria-label={`${t("samplePhotos")} ${idx + 1}`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {selected && (
                        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">
                          {idx + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Field>
            {/* Vehicle papers — optional, can also be added later from "Your listings" */}
            <Field label={t("sectionDocuments")} hint={t("docsOptionalHint")}>
              <DocumentsEditor
                documents={form.documents}
                onChange={(documents) => set({ documents })}
                disabled={submitting}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("formCondition")}>
                <SelectInput
                  value={form.condition}
                  onChange={(v) => set({ condition: v })}
                  options={[
                    { value: "LIKE_NEW", label: t("condLIKE_NEW") },
                    { value: "USED", label: t("condUSED") },
                  ]}
                  placeholder={t("formCondition")}
                />
              </Field>
              <Field label={t("formAccident")}>
                <SelectInput
                  value={form.accidentDeclared}
                  onChange={(v) => set({ accidentDeclared: v })}
                  options={ACCIDENTS.map((a) => ({ value: a, label: t(`accident${a}` as never) }))}
                  placeholder={t("formAccident")}
                />
              </Field>
              <Field label={t("formOwners")}>
                <Input type="number" min={0} value={form.ownershipCount} onChange={(e) => set({ ownershipCount: e.target.value })} placeholder="1" />
              </Field>
              <Field label={t("formImport")}>
                <SelectInput
                  value={form.importOrigin}
                  onChange={(v) => set({ importOrigin: v })}
                  options={IMPORTS.map((i) => ({ value: i, label: i }))}
                  placeholder="—"
                />
              </Field>
              <Field label={t("formVin")}>
                <Input value={form.vinLast6} maxLength={6} onChange={(e) => set({ vinLast6: e.target.value.toUpperCase() })} placeholder="T8H229" />
              </Field>
              <Field label={t("formPlate")}>
                <Input value={form.plateNo} onChange={(e) => set({ plateNo: e.target.value })} placeholder="1KH-8823" />
              </Field>
            </div>
          </div>
        )}

        {/* STEP 3 — price & contact */}
        {step === 3 && (
          <div className="space-y-5">
            {branches.length > 0 && (
              <Field
                label={t("flowBranch")}
                hint={t("flowBranchHint")}
              >
                <SelectInput
                  value={form.branchId || ""}
                  onChange={(bId) => {
                    const b = branches.find((x) => x.id === bId);
                    set({
                      branchId: bId,
                      ...(b ? { city: b.city, district: b.district || form.district } : {}),
                    });
                  }}
                  options={[
                    { value: "", label: `— ${t("flowDefaultBranch")} —` },
                    ...branches.map((b) => ({
                      value: b.id,
                      label: `${b.name}${b.isMain ? " (Main)" : ""} · ${b.city}${b.district ? `, ${b.district}` : ""}`,
                    })),
                  ]}
                  placeholder={t("flowSelectBranch")}
                />
              </Field>
            )}

            {/* Pricing Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 font-bold">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Pricing & Floor Safeguards</h3>
                    <p className="text-[11px] text-slate-500">Base asking price, currency conversion & floor price protection</p>
                  </div>
                </div>

                {/* Mask Price Toggle */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="sell-mask-price" className="text-xs font-semibold text-slate-600 cursor-pointer flex items-center gap-1">
                    <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
                    {t("maskPrice")}
                  </Label>
                  <Switch
                    id="sell-mask-price"
                    checked={form.priceMasked}
                    onCheckedChange={(v) => set({ priceMasked: v })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={form.priceMasked ? `${t("formPrice")} (${t("flowOptional")})` : `${t("formPrice")} (USD $)`}
                  hint={form.priceMasked ? t("flowMaskedPriceHint") : (Number(form.priceUsd) > 0 ? `≈ ${formatKhr((Number(form.priceUsd) || 0) * 4100)}` : "Standard asking price")}
                >
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.priceUsd}
                      onChange={(e) => set({ priceUsd: e.target.value })}
                      placeholder={form.priceMasked ? "—" : "18500"}
                      className="pl-7 text-base font-semibold"
                    />
                  </div>
                </Field>

                <Field
                  label="Floor Price Protection (USD $)"
                  hint="Minimum acceptable sale price. Promotional campaigns cannot discount below this."
                >
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.floorPriceUsd}
                      onChange={(e) => set({ floorPriceUsd: e.target.value })}
                      placeholder="e.g. 16500"
                      className="pl-7"
                    />
                  </div>
                </Field>
              </div>

              {/* Promotional Campaign Switch */}
              <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/70 via-orange-50/50 to-amber-50/70 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-600 animate-pulse" />
                    <div>
                      <Label htmlFor="sell-launch-promo" className="text-xs font-bold text-slate-900 cursor-pointer">
                        Launch Promotional Offer
                      </Label>
                      <p className="text-[11px] text-amber-900">
                        Highlight your listing with Hot Price, Discount, or Clearance badge
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="sell-launch-promo"
                    checked={form.launchPromo}
                    onCheckedChange={(v) => {
                      set({
                        launchPromo: v,
                        ...(v && !form.promoPriceTypeId && availablePriceTypes.length > 0
                          ? { promoPriceTypeId: availablePriceTypes[0].id }
                          : {}),
                      });
                    }}
                  />
                </div>

                {form.launchPromo && (
                  <div className="space-y-3 pt-2 border-t border-amber-200/60 animate-in fade-in slide-in-from-top-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Promotional Tier">
                        <SelectInput
                          value={form.promoPriceTypeId}
                          onChange={(v) => set({ promoPriceTypeId: v })}
                          options={availablePriceTypes.map((pt) => ({
                            value: pt.id,
                            label: `${pt.label} (${pt.mode === "PERCENT" ? "% off" : "Fixed $"})`,
                          }))}
                          placeholder="Select promo tier"
                        />
                      </Field>

                      <Field
                        label={selectedPromoType?.mode === "PERCENT" ? "Discount Percentage (%)" : "Promotional Price (USD $)"}
                        hint={selectedPromoType?.mode === "PERCENT" ? "e.g. 10 for 10% off" : "Target discounted sale price"}
                      >
                        <div className="relative">
                          {selectedPromoType?.mode !== "PERCENT" && (
                            <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">$</span>
                          )}
                          <Input
                            type="number"
                            min={1}
                            max={selectedPromoType?.mode === "PERCENT" ? 99 : undefined}
                            value={form.promoValue}
                            onChange={(e) => set({ promoValue: e.target.value })}
                            placeholder={selectedPromoType?.mode === "PERCENT" ? "10" : "17500"}
                            className={selectedPromoType?.mode !== "PERCENT" ? "pl-7" : ""}
                          />
                          {selectedPromoType?.mode === "PERCENT" && (
                            <span className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400">%</span>
                          )}
                        </div>
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Schedule Start Date (Optional)" hint="Leave blank to start immediately">
                        <Input
                          type="datetime-local"
                          value={form.promoStartDate}
                          onChange={(e) => set({ promoStartDate: e.target.value })}
                        />
                      </Field>
                      <Field label="Schedule End Date (Optional)" hint="Leave blank for ongoing promo">
                        <Input
                          type="datetime-local"
                          value={form.promoEndDate}
                          onChange={(e) => set({ promoEndDate: e.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Pricing Preview Card */}
              {pricingPreview.base > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Live Pricing Preview
                    </span>
                    {pricingPreview.isOnSale && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Save {formatUsd(pricingPreview.discountUsd)} ({pricingPreview.discountPercent}% OFF)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-baseline gap-2.5">
                    {pricingPreview.isOnSale && (
                      <span className="text-sm font-semibold text-slate-400 line-through">
                        {formatUsd(pricingPreview.base)}
                      </span>
                    )}
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                      {formatUsd(pricingPreview.effective)}
                    </span>
                    <span className="text-xs text-slate-500">
                      ≈ {formatKhr(pricingPreview.effective * 4100)}
                    </span>

                    {pricingPreview.isOnSale && selectedPromoType && (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white shadow-xs"
                        style={{ backgroundColor: selectedPromoType.badgeColor || "#ef4444" }}
                      >
                        {selectedPromoType.label}
                      </span>
                    )}
                  </div>

                  {pricingPreview.floorClamped && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <span className="font-bold">Floor Price Enforced: </span>
                        Promotional rule calculated to {formatUsd(pricingPreview.candidate)}, but is clamped to your minimum floor price of {formatUsd(pricingPreview.floor || 0)}.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Location & Details Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">Location & Description</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("formCity")}>
                  <Input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Phnom Penh" />
                </Field>
                <Field label={t("formDistrict")}>
                  <Input value={form.district} onChange={(e) => set({ district: e.target.value })} placeholder={t("flowDistrictPlaceholder")} />
                </Field>
              </div>
              <Field label={t("formDescription")}>
                <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <Field label={t("formDescriptionKm")}>
                <Textarea rows={3} value={form.descriptionKm} onChange={(e) => set({ descriptionKm: e.target.value })} className="font-khmer" />
              </Field>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
              <p className="text-xs leading-relaxed text-amber-800">
                {t("flowScamWarning")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="mt-5 flex gap-2">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-11">
            {t("prevStep")}
          </Button>
        )}
        <Button
          onClick={next}
          disabled={submitting}
          className={cn("h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold", step > 1 ? "flex-1" : "w-full")}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
              {t("loading")}
            </>
          ) : step === 3 ? (
            <>
              <CarFront className="h-4 w-4 mr-2" aria-hidden />
              {t("publishListing")}
            </>
          ) : (
            t("nextStep")
          )}
        </Button>
      </div>

      {/* Your listings — stock management for the signed-in user's own cars */}
      <MyListingsSection />
    </div>
  );
}

// ---------------- Your listings (stock management) ----------------

const MY_LISTINGS_PAGE_SIZE = 8;

function MyListingsSection() {
  const t = useT();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const { data, loading, error, refetch } = useFetch<MyListingRowDTO[]>("/api/vehicles/mine");

  // Page the own-listings list client-side; refetches keep the current page.
  const totalRows = data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = (data ?? []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="mt-8" aria-label={t("myListings")}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">{t("myListings")}</h2>
        {data && data.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {data.length}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{t("myListingsHint")}</p>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : error && !data ? (
          <p className="py-3 text-center text-sm text-slate-500">{error}</p>
        ) : !data || data.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">{t("myListingsEmpty")}</p>
        ) : (
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {v.make} {v.model} {v.variant ?? ""} {v.year}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{formatUsd(v.priceUsd)}</span>
                    <span>· {t("photosCount", { n: v.images.length })}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-3 w-3" aria-hidden /> {v.views}
                    </span>
                  </p>
                </div>
                <VehicleStatusBadge status={v.status} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => {
                    setEditorId(v.id);
                    setEditorOpen(true);
                  }}
                  aria-label={`${t("actEditListing")} — ${v.make} ${v.model}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  <span className="ml-1.5 hidden sm:inline">{t("actEditListing")}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination — paged over your own listings */}
      {totalRows > 0 && (
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
            totalItems={totalRows}
          />
        </div>
      )}

      <ListingEditorDialog
        vehicleId={editorId}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) refetch();
        }}
      />
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
