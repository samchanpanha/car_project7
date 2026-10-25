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
import { CarFront, Check, ChevronDown, ChevronUp, Eye, Loader2, Pencil, PhoneCall, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";

import {
  bodyTypeLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
  partConditionLabels,
  partTargetLabels,
} from "@/lib/i18n";

// Sample photo pool for the demo (mirrors seeded inventory photos)
const SAMPLE_PHOTOS = [
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/e3386ea3c903.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/f4d2ad2b2b7b.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/d47fff7e1477.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/ed5a6ef7abc7.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/24869280e773.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/fe40884e3d34.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/7b6f42c2ef87.jpg",
  "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/466c2bc1a0ee.jpg",
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

  const validateStep = (): string | null => {
    if (step === 1) {
      if (form.listingCategory === "SPARE_PART") {
        if (!canSellParts) {
          return t("sparePartsProRequired");
        }
        if (!form.make.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ាក / ផលិតករ" : "Please enter the brand/manufacturer";
        if (!form.model.trim()) return locale === "km" ? "សូមបញ្ចូលឈ្មោះគ្រឿងបន្លាស់" : "Please enter the part name";
        if (!form.partCategory) return locale === "km" ? "សូមជ្រើសប្រភេទគ្រឿងបន្លាស់" : "Please select a part category";
      } else if (form.listingCategory === "MOTOR") {
        if (!form.make.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ាកម៉ូតូ" : "Please enter the motorcycle make";
        if (!form.model.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ូដែលម៉ូតូ" : "Please enter the motorcycle model";
        const y = Number(form.year);
        if (!y || y < 1980 || y > 2026) return locale === "km" ? "ឆ្នាំមិនត្រឹមត្រូវ" : "Enter a valid year";
        if (!form.bodyType) return locale === "km" ? "សូមជ្រើសប្រភេទម៉ូតូ" : "Select motorcycle type";
      } else {
        // CAR
        if (!form.make.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ាកឡាន" : "Please enter the make";
        if (!form.model.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ូដែល" : "Please enter the model";
        const y = Number(form.year);
        if (!y || y < 1990 || y > 2026) return locale === "km" ? "ឆ្នាំមិនត្រឹមត្រូវ" : "Enter a valid year (1990–2026)";
        if (!form.bodyType || !form.fuel || !form.transmission)
          return locale === "km" ? "សូមជ្រើសប្រភេទឡាន ឥន្ធនៈ ប៉ុស្តិ៍" : "Select body type, fuel and transmission";
        const m = Number(form.mileageKm);
        if (Number.isNaN(m) || m < 0) return locale === "km" ? "ចម្ងាយដំណើរមិនត្រឹមត្រូវ" : "Enter a valid mileage";
      }
    }
    if (step === 2) {
      if (form.images.length === 0)
        return locale === "km" ? "សូមជ្រើសរូបភាពយ៉ាងតិច ១" : "Select at least one photo";
    }
    if (step === 3) {
      if (!form.priceMasked) {
        const p = Number(form.priceUsd);
        if (!p || p <= 0) return locale === "km" ? "សូមបញ្ចូលតម្លៃ" : "Please enter a valid price";
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
                Active Subscription or Free Trial Required to Sell Cars
              </h2>
              <p className="mt-1 text-xs text-amber-900 leading-relaxed">
                Free trial is currently inactive or your subscription has expired. In order to list and sell your vehicle on the KhLan marketplace, please choose a subscription plan below and complete payment via ABA KHQR.
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
              <Label className="text-xs font-bold text-slate-700 mb-1.5 block">Category</Label>
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
                        Sell Car Instead
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
                  <Field label={locale === "km" ? "ម៉ាក / ផលិតករ (Brand)" : "Brand / Manufacturer"}>
                    <Input
                      value={form.make}
                      onChange={(e) => set({ make: e.target.value })}
                      placeholder="e.g. Michelin, Brembo, Toyota, Bosch, Honda"
                    />
                  </Field>
                  <Field label={locale === "km" ? "ឈ្មោះគ្រឿងបន្លាស់ (Part Name)" : "Part Name / Model"}>
                    <Input
                      value={form.model}
                      onChange={(e) => set({ model: e.target.value })}
                      placeholder="e.g. Ceramic Front Brake Pads"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t("compatibleModelsLabel")} hint={locale === "km" ? "ឡាន ឬម៉ូតូដែលអាចប្រើជាមួយ" : "Vehicles this part fits"}>
                    <Input
                      value={form.compatibleModels}
                      onChange={(e) => set({ compatibleModels: e.target.value })}
                      placeholder={t("compatibleModelsPlaceholder")}
                    />
                  </Field>
                  <Field label={t("partNumberLabel")} hint={locale === "km" ? "លេខកូដដើមពីក្រុមហ៊ុន" : "Original part or SKU code"}>
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
                  <Field label={locale === "km" ? "ម៉ាកម៉ូតូ (Make)" : "Motorcycle Make"}>
                    <Input
                      value={form.make}
                      onChange={(e) => set({ make: e.target.value })}
                      placeholder="Honda, Yamaha, Suzuki..."
                      list="kl-motor-makes"
                    />
                    <datalist id="kl-motor-makes">
                      {["Honda", "Yamaha", "Suzuki", "Kawasaki", "Vespa", "GPX", "BMW", "Ducati", "KTM", "Royal Enfield"].map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={locale === "km" ? "ម៉ូដែល (Model)" : "Model"}>
                    <Input
                      value={form.model}
                      onChange={(e) => set({ model: e.target.value })}
                      placeholder="e.g. Dream 125, Scoopy, PCX 160"
                    />
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
                      min={0}
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
                        { value: "AUTOMATIC", label: locale === "km" ? "ស្វ័យប្រវត្តិ (Auto)" : "Automatic" },
                        { value: "MANUAL", label: locale === "km" ? "ធម្មតា / កែប (Manual)" : "Manual / Semi-Auto" },
                      ]}
                      placeholder={t("formTransmission")}
                    />
                  </Field>
                  <Field label={t("formFuel")}>
                    <SelectInput
                      value={form.fuel}
                      onChange={(v) => set({ fuel: v })}
                      options={[
                        { value: "PETROL", label: locale === "km" ? "សាំង" : "Petrol" },
                        { value: "ELECTRIC", label: locale === "km" ? "អគ្គិសនី" : "Electric" },
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
                    <Input value={form.make} onChange={(e) => set({ make: e.target.value })} placeholder="Toyota" list="kl-makes" />
                    <datalist id="kl-makes">
                      {(meta?.makes ?? []).map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("formModel")}>
                    <Input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="Land Cruiser Prado" />
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
                      options={FUELS.map((f) => ({ value: f, label: f === "PETROL" ? (locale === "km" ? "សាំង" : "Petrol") : f === "DIESEL" ? (locale === "km" ? "ម៉ាសុីត" : "Diesel") : f === "HYBRID" ? (locale === "km" ? "ក្រមាស" : "Hybrid") : (locale === "km" ? "អគ្គិសនី" : "Electric") }))}
                      placeholder={t("formFuel")}
                    />
                  </Field>
                  <Field label={t("formTransmission")}>
                    <SelectInput
                      value={form.transmission}
                      onChange={(v) => set({ transmission: v })}
                      options={TRANSMISSIONS.map((tr) => ({ value: tr, label: tr === "AUTOMATIC" ? (locale === "km" ? "ស្វ័យប្រវត្តិ" : "Automatic") : (locale === "km" ? "ធម្មតា" : "Manual") }))}
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
                      options={DRIVETRAINS.map((d) => ({ value: d, label: d }))}
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
                      <Field label={t("specSeats")} hint={locale === "km" ? "ឧ. 5 ឬ 7" : "e.g. 5 or 7"}>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={form.seats}
                          onChange={(e) => set({ seats: e.target.value })}
                          placeholder="5"
                        />
                      </Field>
                      <Field label={t("specInteriorColor")} hint={locale === "km" ? "ឧ. ខ្មៅ, លឿងខ្ចី" : "e.g. Beige, Black"}>
                        <Input
                          value={form.interiorColor}
                          onChange={(e) => set({ interiorColor: e.target.value })}
                          placeholder={locale === "km" ? "ខ្មៅ / លឿងខ្ចី" : "Black / Beige"}
                        />
                      </Field>
                      <Field label={t("specFuelEconomy")} hint={locale === "km" ? "ឧ. 6.5 L/100km ឬ 450 km" : "e.g. 6.5 L/100km or 450 km"}>
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
          <div className="space-y-4">
            {branches.length > 0 && (
              <Field
                label={locale === "km" ? "សាខាបង្ហាញរថយន្ត" : "Showroom Branch"}
                hint={locale === "km" ? "ជ្រើសរើសសាខាដែលរថយន្តនេះកំពុងចត" : "Select which showroom branch this vehicle is located at"}
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
                    { value: "", label: locale === "km" ? "— សាខាចម្បង / ទីតាំងដើម —" : "— Main / Default Showroom —" },
                    ...branches.map((b) => ({
                      value: b.id,
                      label: `${b.name}${b.isMain ? " (Main)" : ""} · ${b.city}${b.district ? `, ${b.district}` : ""}`,
                    })),
                  ]}
                  placeholder={locale === "km" ? "ជ្រើសរើសសាខា" : "Select branch"}
                />
              </Field>
            )}
            {/* Mask Price Toggle */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="sell-mask-price" className="text-sm font-semibold text-slate-900 cursor-pointer flex items-center gap-1.5">
                  <PhoneCall className="h-4 w-4 text-amber-600" />
                  {t("maskPrice")}
                </Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("maskPriceHint")}
                </p>
              </div>
              <Switch
                id="sell-mask-price"
                checked={form.priceMasked}
                onCheckedChange={(v) => set({ priceMasked: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={form.priceMasked ? `${t("formPrice")} (${locale === "km" ? "ជម្រើស" : "Optional"})` : t("formPrice")}
                hint={form.priceMasked ? (locale === "km" ? "តម្លៃខាងក្នុងសម្រាប់តម្រៀបតែប៉ុណ្ណោះ" : "Reference price for sorting only") : undefined}
              >
                <Input
                  type="number"
                  min={0}
                  value={form.priceUsd}
                  onChange={(e) => set({ priceUsd: e.target.value })}
                  placeholder={form.priceMasked ? "—" : "18500"}
                />
              </Field>
              <Field label={t("formCity")}>
                <Input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Phnom Penh" />
              </Field>
              <Field label={t("formDistrict")}>
                <Input value={form.district} onChange={(e) => set({ district: e.target.value })} placeholder={locale === "km" ? "ខណ្ឌចំការមន" : "Chamkarmon"} />
              </Field>
            </div>
            <Field label={t("formDescription")}>
              <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label={t("formDescriptionKm")}>
              <Textarea rows={3} value={form.descriptionKm} onChange={(e) => set({ descriptionKm: e.target.value })} className="font-khmer" />
            </Field>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
              <p className="text-xs leading-relaxed text-amber-800">
                {locale === "km"
                  ? "កុំសរសេរ 'បង់ប្រាក់មុន' ឬពាក្យបញ្ឆោតផ្សេងៗ — ប្រព័ន្ធរបស់យើងនឹងសម្គាល់វាដោយស្វ័យប្រវត្តិ។"
                  : "Avoid phrases like 'deposit first' or scam-pattern wording — our system flags them automatically."}
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
