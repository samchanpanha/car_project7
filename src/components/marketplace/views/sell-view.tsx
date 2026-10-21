"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { MetaDTO } from "@/lib/types";
import type { MyListingRowDTO } from "@/lib/listing-types";
import { GuestPanel } from "@/components/marketplace/guest-panel";
import { PhotoUploader, ListingEditorDialog } from "@/components/marketplace/listing-editor";
import { VehicleStatusBadge } from "@/components/marketplace/dashboard/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarFront, Check, Eye, Loader2, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";

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
const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];
const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];
const IMPORTS = ["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"];
const ACCIDENTS = ["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"];

interface SellForm {
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
  condition: string;
  accidentDeclared: string;
  ownershipCount: string;
  vinLast6: string;
  plateNo: string;
  importOrigin: string;
  priceUsd: string;
  city: string;
  district: string;
  description: string;
  descriptionKm: string;
}

const EMPTY: SellForm = {
  make: "", model: "", variant: "", year: "", mileageKm: "", bodyType: "", fuel: "", transmission: "",
  engineCc: "", drivetrain: "", images: [], condition: "USED", accidentDeclared: "UNKNOWN",
  ownershipCount: "", vinLast6: "", plateNo: "", importOrigin: "", priceUsd: "", city: "Phnom Penh",
  district: "", description: "", descriptionKm: "",
};

export function SellView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
  const { data: meta } = useFetch<MetaDTO>("/api/meta");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SellForm>(EMPTY);
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

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!form.make.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ាកឡាន" : "Please enter the make";
      if (!form.model.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ូដែល" : "Please enter the model";
      const y = Number(form.year);
      if (!y || y < 1990 || y > 2026) return locale === "km" ? "ឆ្នាំមិនត្រឹមត្រូវ" : "Enter a valid year (1990–2026)";
      if (!form.bodyType || !form.fuel || !form.transmission)
        return locale === "km" ? "សូមជ្រើសប្រភេទឡាន ឥន្ធនៈ ប៉ុស្តិ៍" : "Select body type, fuel and transmission";
      const m = Number(form.mileageKm);
      if (Number.isNaN(m) || m < 0) return locale === "km" ? "ចម្ងាយដំណើរមិនត្រឹមត្រូវ" : "Enter a valid mileage";
    }
    if (step === 2) {
      if (form.images.length === 0)
        return locale === "km" ? "សូមជ្រើសរូបភាពយ៉ាងតិច ១" : "Select at least one photo";
    }
    if (step === 3) {
      const p = Number(form.priceUsd);
      if (!p || p <= 0) return locale === "km" ? "សូមបញ្ចូលតម្លៃ" : "Please enter a valid price";
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
      const res = await apiSend<{ vehicle: { id: string } }>("/api/vehicles", "POST", {
        make: form.make.trim(),
        model: form.model.trim(),
        variant: form.variant.trim() || undefined,
        year: Number(form.year),
        priceUsd: Number(form.priceUsd),
        mileageKm: Math.round(Number(form.mileageKm) || 0),
        transmission: form.transmission,
        fuel: form.fuel,
        bodyType: form.bodyType,
        engineCc: form.engineCc ? Number(form.engineCc) : undefined,
        drivetrain: form.drivetrain || undefined,
        exteriorColor: undefined,
        condition: form.condition,
        accidentDeclared: form.accidentDeclared,
        city: form.city || "Phnom Penh",
        district: form.district.trim() || undefined,
        description: form.description.trim() || undefined,
        descriptionKm: form.descriptionKm.trim() || undefined,
        vinLast6: form.vinLast6.trim().slice(0, 6) || undefined,
        plateNo: form.plateNo.trim() || undefined,
        ownershipCount: form.ownershipCount ? Number(form.ownershipCount) : undefined,
        importOrigin: form.importOrigin || undefined,
        images: form.images,
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
  if (isGuest(me)) {
    return <GuestPanel icon={<CarFront className="h-6 w-6" aria-hidden />} />;
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
        {/* STEP 1 — vehicle details */}
        {step === 1 && (
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
                    onClick={() => set({ bodyType: bt })}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                      form.bodyType === bt ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                    aria-pressed={form.bodyType === bt}
                  >
                    {bt}
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
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("formPrice")}>
                <Input type="number" min={100} value={form.priceUsd} onChange={(e) => set({ priceUsd: e.target.value })} placeholder="18500" />
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

function MyListingsSection() {
  const t = useT();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const { data, loading, error, refetch } = useFetch<MyListingRowDTO[]>("/api/vehicles/mine");

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
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto pr-1">
            {data.map((v) => (
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
