"use client";

// Shared listing stock editor (Task 16) — full information form + unlimited
// image manager (upload files / add a link / remove / set cover). Used by the
// dealer dashboard inventory tab and the "Your listings" section of the sell
// view. Talks to PATCH /api/vehicles/[id] (manage authorization server-side).

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import { apiSend, useFetch } from "@/lib/client-hooks";
import { fileToDataUrl } from "@/lib/image-client";
import type { ManageableVehicleDetailDTO } from "@/lib/listing-types";
import type { MetaDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CarFront, ChevronLeft, ChevronRight, FileText, FileUp, GripVertical, ImagePlus, Link2, Loader2, Plus, Star, TriangleAlert, X,
} from "lucide-react";
import { fuelLabels, transmissionLabels } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"];
const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];
const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];
const IMPORTS = ["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"];
const ACCIDENTS = ["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"];
const EDIT_STATUSES = ["PUBLISHED", "DRAFT", "SOLD", "ARCHIVED"];

// ---------------- Documents editor (Task 17) ----------------

const DOC_TYPES = ["REGISTRATION_BOOK", "IMPORT_DECLARATION", "SERVICE_RECORD", "INSPECTION_CERT", "INSURANCE"];
const ALL_DOC_STATUSES = ["PROVIDED", "MISSING", "VERIFIED", "REJECTED"];
const SELLER_DOC_STATUSES = ["PROVIDED", "MISSING"];

/** Client-side document row — `id` present = already stored on the server. */
export interface DocumentRow {
  id?: string;
  type: string;
  status: string;
  notes: string;
  fileUrl: string | null;
}

/** Read a file as a raw data URL — used for PDFs (no canvas downscale). */
function rawFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

const isPdfUrl = (url: string) => url.toLowerCase().endsWith(".pdf");

/**
 * Optional vehicle-papers manager: one row per document (type + status +
 * optional note + optional uploaded photo/PDF). Rows are fully client-side
 * until the parent form saves — then the PATCH diffs them by id.
 */
export function DocumentsEditor({
  documents,
  onChange,
  disabled,
  canVerify,
}: {
  documents: DocumentRow[];
  onChange: (next: DocumentRow[]) => void;
  disabled?: boolean;
  canVerify?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Which row is currently uploading its file (keyed like the row list).
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  // The row the shared file picker was opened for.
  const pendingKeyRef = useRef<string | null>(null);

  const rowKey = (d: DocumentRow, i: number) => d.id ?? `new-${i}`;

  const update = (key: string, patch: Partial<DocumentRow>) =>
    onChange(documents.map((d, i) => (rowKey(d, i) === key ? { ...d, ...patch } : d)));

  const removeAt = (idx: number) => onChange(documents.filter((_, i) => i !== idx));

  const addRow = () =>
    onChange([...documents, { type: "REGISTRATION_BOOK", status: "PROVIDED", notes: "", fileUrl: null }]);

  const uploadFile = async (key: string, file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.warning(t("docUnsupported"));
      return;
    }
    // PDFs cannot be downscaled client-side — enforce the server cap early.
    if (file.size > 3 * 1024 * 1024) {
      toast.warning(t("docTooLarge"));
      return;
    }
    setUploadingKey(key);
    try {
      const dataUrl = isPdf ? await rawFileToDataUrl(file) : await fileToDataUrl(file, 1600, 0.85);
      const res = await apiSend<{ url: string }>("/api/uploads", "POST", { dataUrl });
      update(key, { fileUrl: res.url });
    } catch {
      toast.error(t("uploadFailedCount", { n: 1 }));
    } finally {
      setUploadingKey(null);
    }
  };

  const statusOptions = (canVerify ? ALL_DOC_STATUSES : SELLER_DOC_STATUSES).map((s) => ({
    value: s,
    label: t(`doc${s}` as never),
    disabled: false,
  }));

  return (
    <div>
      {/* One shared file picker — pendingKeyRef routes the chosen file to the
          row whose "Upload file" button was clicked. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label={t("docUploadFile")}
        onChange={(e) => {
          const key = pendingKeyRef.current;
          const f = e.target.files?.[0];
          if (f && key) void uploadFile(key, f);
          e.target.value = "";
        }}
      />
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((d, idx) => {
            const key = rowKey(d, idx);
            // Sellers see admin-set VERIFIED/REJECTED as read-only options.
            const options =
              !canVerify && !SELLER_DOC_STATUSES.includes(d.status)
                ? [...statusOptions, { value: d.status, label: t(`doc${d.status}` as never), disabled: true }]
                : statusOptions;
            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={d.type} onValueChange={(v) => update(key, { type: v })}>
                      <SelectTrigger className="h-9 w-full" aria-label={t("docTypeLabel")}>
                        <SelectValue placeholder={t("docTypeLabel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((tp) => (
                          <SelectItem key={tp} value={tp}>
                            {t(`doc${tp}` as never)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 shrink-0">
                    <Select value={d.status} onValueChange={(v) => update(key, { status: v })}>
                      <SelectTrigger className="h-9 w-full" aria-label={t("docStatusLabel")}>
                        <SelectValue placeholder={t("docStatusLabel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    disabled={disabled}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={t("removeDocument")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <Input
                  value={d.notes}
                  onChange={(e) => update(key, { notes: e.target.value })}
                  placeholder={t("docNotesLabel")}
                  className="mt-2 h-9 text-xs"
                  aria-label={t("docNotesLabel")}
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {d.fileUrl ? (
                    <>
                      {isPdfUrl(d.fileUrl) ? (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
                        >
                          <FileText className="h-4 w-4 text-rose-600" aria-hidden />
                          PDF
                        </a>
                      ) : (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-slate-200"
                          aria-label={t("docViewFile")}
                        >
                          <img src={d.fileUrl} alt="" className="h-10 w-14 object-cover" loading="lazy" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => update(key, { fileUrl: null })}
                        disabled={disabled}
                        className="cursor-pointer text-[11px] font-medium text-slate-400 underline-offset-2 transition hover:text-red-600 hover:underline"
                      >
                        {t("docRemoveFile")}
                      </button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={disabled || uploadingKey === key}
                      onClick={() => {
                        pendingKeyRef.current = key;
                        inputRef.current?.click();
                      }}
                    >
                      {uploadingKey === key ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden />
                          {t("loading")}
                        </>
                      ) : (
                        <>
                          <FileUp className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                          {t("docUploadFile")}
                        </>
                      )}
                    </Button>
                  )}
                  <span className="text-[11px] text-slate-400">{t("docFileHint")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-9 border-dashed border-slate-300 text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
        disabled={disabled}
        onClick={addRow}
      >
        <Plus className="h-4 w-4 mr-1.5" aria-hidden />
        {t("addDocument")}
      </Button>
    </div>
  );
}

// ---------------- PhotoUploader ----------------

/**
 * Unlimited photo manager: multi-file upload (client-downscaled, stored via
 * POST /api/uploads), link adds, remove, set-as-cover, and drag-and-drop
 * reordering (HTML5 DnD with live preview, plus ‹ › buttons for touch and
 * keyboard users). `images` is the ordered desired list — first is the cover.
 */
export function PhotoUploader({
  images,
  onChange,
  disabled,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  // Latest list ref so in-flight uploads never resurrect a just-removed photo.
  const latest = useRef(images);
  latest.current = images;
  // Drag-to-reorder state: source index while a tile is dragged + the tile
  // currently hovered over (drop target highlight).
  const dragFrom = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const commit = (next: string[]) => onChange(Array.from(new Set(next)));

  /** Move the photo at `from` to position `to` (order = saved order on PATCH). */
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= latest.current.length) return;
    const next = [...latest.current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  const handleDragStart = (idx: number, e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragFrom.current = idx;
    setDragIdx(idx);
    // Firefox refuses to start a drag without payload data.
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  // Live preview: the hovered tile swaps with the dragged one as you move.
  const handleDragEnter = (idx: number) => {
    if (dragFrom.current === null || dragFrom.current === idx) return;
    reorder(dragFrom.current, idx);
    dragFrom.current = idx;
    setOverIdx(idx);
  };

  const endDrag = () => {
    dragFrom.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  const uploadFiles = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(list.length);
    let failed = 0;
    const added: string[] = [];
    for (const file of list) {
      try {
        const dataUrl = await fileToDataUrl(file, 1280, 0.82);
        const res = await apiSend<{ url: string }>("/api/uploads", "POST", { dataUrl });
        added.push(res.url);
      } catch {
        failed += 1;
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (added.length > 0) commit([...latest.current, ...added]);
    if (failed > 0) toast.error(t("uploadFailedCount", { n: failed }));
  };

  const addUrl = () => {
    const u = urlInput.trim();
    if (!u || !/^(https?:\/\/|\/api\/uploads\/)/.test(u)) {
      toast.warning(t("invalidPhotoUrl"));
      return;
    }
    if (!latest.current.includes(u)) commit([...latest.current, u]);
    setUrlInput("");
  };

  const removeAt = (idx: number) => commit(images.filter((_, i) => i !== idx));
  const makeCover = (idx: number) => {
    if (idx === 0) return;
    commit([images[idx], ...images.filter((_, i) => i !== idx)]);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label={t("uploadPhotos")}
          onChange={(e) => {
            if (e.target.files) void uploadFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
          disabled={disabled || uploading > 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading > 0 ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
              {t("uploadingPhotos", { n: uploading })}
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4 mr-1.5" aria-hidden />
              {t("uploadPhotos")}
            </>
          )}
        </Button>
        <span className="text-[11px] text-slate-400">{t("photosUnlimitedHint")}</span>
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="https://…"
          className="h-9 text-xs"
          aria-label={t("addPhotoUrl")}
        />
        <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled} onClick={addUrl}>
          <Link2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {images.length > 0 && (
        <>
          <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
            {images.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(idx, e)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={endDrag}
                className={cn(
                  "group relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-slate-100",
                  idx === 0 ? "border-amber-500" : "border-transparent",
                  !disabled && "cursor-grab active:cursor-grabbing",
                  dragIdx === idx && "opacity-40",
                  overIdx === idx && dragIdx !== null && dragIdx !== idx && "ring-2 ring-amber-400",
                )}
              >
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                {idx === 0 ? (
                  <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                    {t("coverBadge")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeCover(idx)}
                    disabled={disabled}
                    className="absolute left-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-slate-950/60 text-white opacity-80 transition hover:bg-amber-500 hover:text-slate-950 hover:opacity-100"
                    aria-label={t("setCover")}
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  disabled={disabled}
                  className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-slate-950/60 text-white transition hover:bg-red-500"
                  aria-label={t("removePhoto")}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                {/* Move-earlier / move-later — touch + keyboard fallback for DnD */}
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => reorder(idx, idx - 1)}
                    disabled={disabled}
                    className="absolute bottom-1 left-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-slate-950/60 text-white transition hover:bg-amber-500 hover:text-slate-950"
                    aria-label={t("movePhotoLeft")}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                {idx < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => reorder(idx, idx + 1)}
                    disabled={disabled}
                    className="absolute bottom-1 right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-slate-950/60 text-white transition hover:bg-amber-500 hover:text-slate-950"
                    aria-label={t("movePhotoRight")}
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                {/* Drag affordance — grip badge shown on hover */}
                {!disabled && images.length > 1 && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center opacity-0 transition group-hover:opacity-100">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/60 text-white">
                      <GripVertical className="h-3 w-3" aria-hidden />
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
          {images.length > 1 && !disabled && (
            <p className="mt-2 text-[11px] text-slate-400">{t("dragPhotosHint")}</p>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- ListingEditorDialog ----------------

interface EditorForm {
  make: string;
  model: string;
  variant: string;
  year: string;
  mileageKm: string;
  priceUsd: string;
  transmission: string;
  fuel: string;
  engineCc: string;
  drivetrain: string;
  bodyType: string;
  exteriorColor: string;
  city: string;
  district: string;
  condition: string;
  accidentDeclared: string;
  ownershipCount: string;
  vinLast6: string;
  plateNo: string;
  importOrigin: string;
  description: string;
  descriptionKm: string;
  status: string;
  images: string[];
  documents: DocumentRow[];
}

function toForm(v: ManageableVehicleDetailDTO): EditorForm {
  return {
    make: v.make,
    model: v.model,
    variant: v.variant ?? "",
    year: String(v.year),
    mileageKm: String(v.mileageKm),
    priceUsd: String(v.priceUsd),
    transmission: v.transmission,
    fuel: v.fuel,
    engineCc: v.engineCc ? String(v.engineCc) : "",
    drivetrain: v.drivetrain ?? "",
    bodyType: v.bodyType,
    exteriorColor: v.exteriorColor ?? "",
    city: v.city,
    district: v.district ?? "",
    condition: v.condition,
    accidentDeclared: v.accidentDeclared,
    ownershipCount: v.ownershipCount ? String(v.ownershipCount) : "",
    vinLast6: v.vinLast6 ?? "",
    plateNo: v.plateNo ?? "",
    importOrigin: v.importOrigin ?? "",
    description: v.description ?? "",
    descriptionKm: v.descriptionKm ?? "",
    status: v.status,
    images: v.images,
    documents: (v.documents ?? []).map((d) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      notes: d.notes ?? "",
      fileUrl: d.fileUrl,
    })),
  };
}

export function ListingEditorDialog({
  vehicleId,
  open,
  onOpenChange,
  onSaved,
}: {
  vehicleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data: meta } = useFetch<MetaDTO>(open ? "/api/meta" : null);
  // GET /api/vehicles/[id] returns { vehicle, similar } — unwrap the vehicle.
  const detail = useFetch<{ vehicle: ManageableVehicleDetailDTO; similar: unknown }>(
    open && vehicleId ? `/api/vehicles/${vehicleId}` : null,
  );
  const vehicle = detail.data?.vehicle ?? null;
  const [form, setForm] = useState<EditorForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) setForm(toForm(vehicle));
    if (detail.error) setForm(null);
  }, [vehicle, detail.error]);

  // Reset local state whenever a different vehicle is opened.
  useEffect(() => {
    setForm(null);
  }, [vehicleId]);

  const set = (patch: Partial<EditorForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const title = useMemo(
    () => (form ? `${form.make} ${form.model} ${form.variant ?? ""} ${form.year}`.trim() : ""),
    [form],
  );

  const validate = (): string | null => {
    if (!form) return null;
    if (!form.make.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ាកឡាន" : "Please enter the make";
    if (!form.model.trim()) return locale === "km" ? "សូមបញ្ចូលម៉ូដែល" : "Please enter the model";
    const y = Number(form.year);
    if (!Number.isInteger(y) || y < 1990 || y > 2026)
      return locale === "km" ? "ឆ្នាំមិនត្រឹមត្រូវ" : "Enter a valid year (1990–2026)";
    const p = Number(form.priceUsd);
    if (!Number.isFinite(p) || p <= 0) return locale === "km" ? "សូមបញ្ចូលតម្លៃ" : "Please enter a valid price";
    const m = Number(form.mileageKm);
    if (Number.isNaN(m) || m < 0) return locale === "km" ? "ចម្ងាយដំណើរមិនត្រឹមត្រូវ" : "Enter a valid mileage";
    if (!form.bodyType || !form.fuel || !form.transmission)
      return locale === "km" ? "សូមជ្រើសប្រភេទឡាន ឥន្ធនៈ ប៉ុស្តិ៍" : "Select body type, fuel and transmission";
    return null;
  };

  const save = async () => {
    if (!form || !vehicleId) return;
    const err = validate();
    if (err) {
      toast.warning(err);
      return;
    }
    setSaving(true);
    try {
      await apiSend(`/api/vehicles/${vehicleId}`, "PATCH", {
        make: form.make.trim(),
        model: form.model.trim(),
        variant: form.variant.trim() || null,
        year: Number(form.year),
        priceUsd: Number(form.priceUsd),
        mileageKm: Math.round(Number(form.mileageKm) || 0),
        transmission: form.transmission,
        fuel: form.fuel,
        engineCc: form.engineCc ? Number(form.engineCc) : null,
        drivetrain: form.drivetrain || null,
        bodyType: form.bodyType,
        exteriorColor: form.exteriorColor.trim() || null,
        city: form.city.trim() || "Phnom Penh",
        district: form.district.trim() || null,
        condition: form.condition,
        accidentDeclared: form.accidentDeclared,
        ownershipCount: form.ownershipCount ? Number(form.ownershipCount) : null,
        vinLast6: form.vinLast6.trim().slice(0, 6) || null,
        plateNo: form.plateNo.trim() || null,
        importOrigin: form.importOrigin || null,
        description: form.description.trim() || null,
        descriptionKm: form.descriptionKm.trim() || null,
        status: form.status,
        images: form.images, // full ordered list — add/remove/reorder in one call
        documents: form.documents.map((d) => ({
          ...(d.id ? { id: d.id } : {}),
          type: d.type,
          status: d.status,
          notes: d.notes.trim() || null,
          fileUrl: d.fileUrl,
        })),
      });
      toast.success(t("listingUpdated"));
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onOpenChange(false); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CarFront className="h-4 w-4 text-amber-600" aria-hidden />
            {t("editListingTitle")}
          </DialogTitle>
        </DialogHeader>

        {detail.loading && !form ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : !form ? (
          <p className="py-6 text-center text-sm text-slate-500">{detail.error || t("errorGeneric")}</p>
        ) : vehicle?.manage === false ? (
          <p className="py-6 text-center text-sm text-slate-500">{t("errorGeneric")}</p>
        ) : (
          <div className="space-y-5">
            {/* Photos — unlimited stock manager */}
            <section>
              <Label className="text-xs font-medium text-slate-500">{t("formPhotos")}</Label>
              <div className="mt-2">
                <PhotoUploader images={form.images} onChange={(images) => set({ images })} disabled={saving} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {t("photosCount", { n: form.images.length })} · {t("coverHint")}
              </p>
            </section>

            {/* Documents — optional vehicle papers (Task 17) */}
            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sectionDocuments")}</p>
                {form.documents.length > 0 && (
                  <span className="text-[11px] text-slate-400">{t("documentsCount", { n: form.documents.length })}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{t("docsOptionalHint")}</p>
              <div className="mt-2">
                <DocumentsEditor
                  documents={form.documents}
                  onChange={(documents) => set({ documents })}
                  disabled={saving}
                  canVerify={vehicle.canVerifyDocuments ?? false}
                />
              </div>
            </section>

            {/* Car details */}
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sectionCarDetails")}</p>
              <div className="grid grid-cols-2 gap-3">
                <EditField label={t("formMake")}>
                  <Input value={form.make} onChange={(e) => set({ make: e.target.value })} list="kl-ed-makes" />
                  <datalist id="kl-ed-makes">
                    {(meta?.makes ?? []).map((m) => <option key={m} value={m} />)}
                  </datalist>
                </EditField>
                <EditField label={t("formModel")}>
                  <Input value={form.model} onChange={(e) => set({ model: e.target.value })} />
                </EditField>
                <EditField label={t("formVariant")}>
                  <Input value={form.variant} onChange={(e) => set({ variant: e.target.value })} />
                </EditField>
                <EditField label={t("formYear")}>
                  <Input type="number" min={1990} max={2026} value={form.year} onChange={(e) => set({ year: e.target.value })} />
                </EditField>
                <EditField label={t("specMileage")}>
                  <Input type="number" min={0} value={form.mileageKm} onChange={(e) => set({ mileageKm: e.target.value })} />
                </EditField>
                <EditField label={t("formColor")}>
                  <Input value={form.exteriorColor} onChange={(e) => set({ exteriorColor: e.target.value })} placeholder="White" />
                </EditField>
                <EditField label={t("formBodyType")}>
                  <EditSelect value={form.bodyType} onChange={(v) => set({ bodyType: v })} options={BODY_TYPES.map((b) => ({ value: b, label: b }))} placeholder={t("formBodyType")} />
                </EditField>
                <EditField label={t("formFuel")}>
                  <EditSelect value={form.fuel} onChange={(v) => set({ fuel: v })} options={FUELS.map((f) => ({ value: f, label: fuelLabels[f]?.[locale] ?? f }))} placeholder={t("formFuel")} />
                </EditField>
                <EditField label={t("formTransmission")}>
                  <EditSelect value={form.transmission} onChange={(v) => set({ transmission: v })} options={TRANSMISSIONS.map((tr) => ({ value: tr, label: transmissionLabels[tr]?.[locale] ?? tr }))} placeholder={t("formTransmission")} />
                </EditField>
                <EditField label={t("formDrivetrain")}>
                  <EditSelect value={form.drivetrain} onChange={(v) => set({ drivetrain: v })} options={DRIVETRAINS.map((d) => ({ value: d, label: d }))} placeholder="—" />
                </EditField>
                <EditField label={t("formEngine")}>
                  <Input type="number" min={0} value={form.engineCc} onChange={(e) => set({ engineCc: e.target.value })} />
                </EditField>
                <EditField label={t("formCondition")}>
                  <EditSelect value={form.condition} onChange={(v) => set({ condition: v })} options={[{ value: "LIKE_NEW", label: t("condLIKE_NEW") }, { value: "USED", label: t("condUSED") }]} placeholder={t("formCondition")} />
                </EditField>
                <EditField label={t("formAccident")}>
                  <EditSelect value={form.accidentDeclared} onChange={(v) => set({ accidentDeclared: v })} options={ACCIDENTS.map((a) => ({ value: a, label: t(`accident${a}` as never) }))} placeholder={t("formAccident")} />
                </EditField>
                <EditField label={t("formOwners")}>
                  <Input type="number" min={0} value={form.ownershipCount} onChange={(e) => set({ ownershipCount: e.target.value })} />
                </EditField>
                <EditField label={t("formVin")}>
                  <Input value={form.vinLast6} maxLength={6} onChange={(e) => set({ vinLast6: e.target.value.toUpperCase() })} />
                </EditField>
                <EditField label={t("formPlate")}>
                  <Input value={form.plateNo} onChange={(e) => set({ plateNo: e.target.value })} />
                </EditField>
                <EditField label={t("formImport")}>
                  <EditSelect value={form.importOrigin} onChange={(v) => set({ importOrigin: v })} options={IMPORTS.map((i) => ({ value: i, label: i }))} placeholder="—" />
                </EditField>
              </div>
            </section>

            {/* Price & location */}
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sectionPriceLocation")}</p>
              <div className="grid grid-cols-2 gap-3">
                <EditField label={t("formPrice")}>
                  <Input type="number" min={0} value={form.priceUsd} onChange={(e) => set({ priceUsd: e.target.value })} />
                </EditField>
                <EditField label={t("formCity")}>
                  <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
                </EditField>
                <EditField label={t("formDistrict")}>
                  <Input value={form.district} onChange={(e) => set({ district: e.target.value })} />
                </EditField>
                <EditField label={t("sectionStatus")}>
                  <EditSelect
                    value={form.status}
                    onChange={(v) => set({ status: v })}
                    options={EDIT_STATUSES.map((s) => ({ value: s, label: t(`vst${s}` as never) }))}
                    placeholder={t("sectionStatus")}
                  />
                </EditField>
              </div>
            </section>

            {/* Description */}
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("sectionDescription")}</p>
              <div className="space-y-3">
                <EditField label={t("formDescription")}>
                  <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                </EditField>
                <EditField label={t("formDescriptionKm")}>
                  <Textarea rows={3} value={form.descriptionKm} onChange={(e) => set({ descriptionKm: e.target.value })} className="font-khmer" />
                </EditField>
              </div>
            </section>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p className="text-xs leading-relaxed text-amber-800">{t("editListingNote")}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !form || detail.loading}
            className="bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {t("loading")}
              </>
            ) : (
              t("saveChanges")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-500">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function EditSelect({
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
