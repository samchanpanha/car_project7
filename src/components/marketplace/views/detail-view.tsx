"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { VehicleCardDTO, VehicleDetailDTO } from "@/lib/types";
import type { VehicleDetailWithFilesDTO } from "@/lib/listing-types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { ContactDialog } from "@/components/marketplace/contact-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReportStatusBadge } from "@/components/marketplace/status-badge";
import {
  ArrowLeft, BadgeCheck, CalendarClock, CarFront, ChevronLeft, ChevronRight, Eye, FileCheck2, FileText, FileX2,
  Flag, Gauge, Handshake, Heart, Loader2, MapPin, MessageSquare, Phone, RefreshCw, Send, ShieldCheck,
  ShieldAlert, Star, Timer, TriangleAlert, Users,
} from "lucide-react";
import { useState } from "react";
import { formatKhr, formatMileage, formatUsd, timeAgo } from "@/lib/format";
import { bodyTypeLabels, drivetrainLabels, fuelLabels, transmissionLabels } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ABUSE_REASONS = ["SCAM", "WRONG_INFO", "DUPLICATE", "OFFENSIVE", "SOLD", "OTHER"] as const;

/** Local "YYYY-MM-DDTHH:mm" for datetime-local min attribute. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DetailView({ vehicleId }: { vehicleId: string }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavoriteLocal = useAppStore((s) => s.toggleFavoriteLocal);
  const setFavorites = useAppStore((s) => s.setFavorites);

  const { data, loading, error, refetch } = useFetch<{ vehicle: VehicleDetailWithFilesDTO; similar: VehicleCardDTO[] }>(
    `/api/vehicles/${vehicleId}`
  );
  const [imgIndex, setImgIndex] = useState(0);
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof ABUSE_REASONS)[number]>("SCAM");
  const [reportDetails, setReportDetails] = useState("");
  const [generating, setGenerating] = useState(false);
  // test drive appointment
  const [tdOpen, setTdOpen] = useState(false);
  const [tdWhen, setTdWhen] = useState("");
  const [tdNotes, setTdNotes] = useState("");
  const [tdSubmitting, setTdSubmitting] = useState(false);
  // purchase request
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyMessage, setBuyMessage] = useState("");
  const [buySubmitting, setBuySubmitting] = useState(false);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-10">
        <Skeleton className="h-8 w-64" />
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center pb-24 md:pb-10">
        <TriangleAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <p className="mt-3 text-slate-600">{error || t("errorGeneric")}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ name: "browse" })}>
          {t("navBrowse")}
        </Button>
      </div>
    );
  }

  const v = data.vehicle;
  const isFav = favorites.includes(v.id);
  const title = `${v.make} ${v.model} ${v.variant ?? ""} ${v.year}`.trim();
  const sellerName = v.sellerFull.shopName || v.sellerFull.name;
  const desc = locale === "km" && v.descriptionKm ? v.descriptionKm : v.description;

  const toggleFavorite = async () => {
    if (isGuest(me)) {
      toast.info(t("authRequiredToast"));
      navigate({ name: "auth", tab: "signup" });
      return;
    }
    toggleFavoriteLocal(v.id);
    try {
      if (isFav) await apiSend(`/api/favorites?vehicleId=${v.id}`, "DELETE");
      else await apiSend("/api/favorites", "POST", { vehicleId: v.id });
      const res = await fetch("/api/favorites");
      const json = await res.json();
      setFavorites(json.vehicleIds ?? []);
    } catch {
      toggleFavoriteLocal(v.id);
      toast.error(t("errorGeneric"));
    }
  };

  const generateReport = async () => {
    setGenerating(true);
    try {
      await apiSend(`/api/vehicles/${v.id}/report`, "POST");
      toast.success(locale === "km" ? "បង្កើតរបាយការណ៍បានជោគជ័យ" : "Report generated");
      refetch();
      navigate({ name: "report", vehicleId: v.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setGenerating(false);
    }
  };

  const submitAbuse = async () => {
    try {
      await apiSend("/api/reports/abuse", "POST", { vehicleId: v.id, reason: reportReason, details: reportDetails || undefined });
      toast.success(t("reportThanks"));
      setReportOpen(false);
      setReportDetails("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    }
  };

  const submitTestDrive = async () => {
    if (!tdWhen) return;
    setTdSubmitting(true);
    try {
      await apiSend("/api/account/appointments", "POST", {
        vehicleId: v.id,
        scheduledAt: new Date(tdWhen).toISOString(),
        notes: tdNotes.trim() || undefined,
      });
      toast.success(t("toastAppointmentRequested"));
      setTdOpen(false);
      setTdWhen("");
      setTdNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setTdSubmitting(false);
    }
  };

  const openBuyDialog = () => {
    if (!me) return;
    if (isGuest(me)) {
      toast.info(t("authRequiredToast"));
      navigate({ name: "auth", tab: "signup" });
      return;
    }
    setBuyOpen(true);
  };

  /** Contact / test-drive stay public-friendly: guests are asked to register. */
  const openAuthedDialog = (open: () => void) => () => {
    if (isGuest(me)) {
      toast.info(t("authRequiredToast"));
      navigate({ name: "auth", tab: "signup" });
      return;
    }
    open();
  };

  const submitBuyRequest = async () => {
    setBuySubmitting(true);
    try {
      await apiSend("/api/purchases", "POST", {
        vehicleId: v.id,
        message: buyMessage.trim() || undefined,
      });
      toast.success(t("buyRequestedToast"));
      setBuyOpen(false);
      setBuyMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBuySubmitting(false);
    }
  };

  const specs: Array<{ label: string; value: string }> = [
    { label: t("specYear"), value: String(v.year) },
    { label: t("specMileage"), value: formatMileage(v.mileageKm, locale) },
    { label: t("specTransmission"), value: transmissionLabels[v.transmission]?.[locale] ?? v.transmission },
    { label: t("specFuel"), value: fuelLabels[v.fuel]?.[locale] ?? v.fuel },
    ...(v.engineCc ? [{ label: t("specEngine"), value: `${v.engineCc} cc` }] : []),
    ...(v.drivetrain ? [{ label: t("specDrivetrain"), value: drivetrainLabels[v.drivetrain]?.[locale] ?? v.drivetrain }] : []),
    { label: t("specBody"), value: bodyTypeLabels[v.bodyType]?.[locale] ?? v.bodyType },
    ...(v.exteriorColor ? [{ label: t("specColor"), value: v.exteriorColor }] : []),
    ...(v.ownershipCount != null ? [{ label: t("specOwnerCount"), value: String(v.ownershipCount) }] : []),
    ...(v.importOrigin ? [{ label: t("specImport"), value: v.importOrigin }] : []),
    { label: t("specAccident"), value: t(`accident${v.accidentDeclared}` as never) },
    ...(v.plateNo ? [{ label: t("specPlate"), value: v.plateNo }] : []),
    ...(v.vinLast6 ? [{ label: t("specVin"), value: `•••${v.vinLast6}` }] : []),
  ];

  const docIcon = (status: string) =>
    status === "VERIFIED" ? (
      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
    ) : status === "MISSING" ? (
      <FileX2 className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
    ) : status === "REJECTED" ? (
      <FileX2 className="h-4 w-4 text-rose-600 shrink-0" aria-hidden />
    ) : (
      <FileCheck2 className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 pb-28 md:pb-10">
      {/* Breadcrumb / back */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ name: "browse" })} className="-ml-2 text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden />
          {t("backToResults")}
        </Button>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden />
          {t("reportListing")}
        </button>
      </div>

      <div className="mt-3 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        {/* ------- Left: gallery + specs + docs + description ------- */}
        <div>
          {/* Gallery */}
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]">
            {v.images[imgIndex] ? (
               
              <img
                src={v.images[imgIndex]}
                alt={`${title} — photo ${imgIndex + 1} of ${v.images.length}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-300">
                <CarFront className="h-16 w-16" aria-hidden />
              </div>
            )}
            {v.images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIndex((i) => (i - 1 + v.images.length) % v.images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow hover:bg-white cursor-pointer"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  onClick={() => setImgIndex((i) => (i + 1) % v.images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow hover:bg-white cursor-pointer"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
                <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/70 px-2.5 py-0.5 text-xs text-white">
                  {imgIndex + 1} / {v.images.length}
                </span>
              </>
            )}
            {v.featured && (
              <Badge className="absolute top-2 left-2 bg-amber-500 text-slate-950 hover:bg-amber-500 gap-1">
                <Star className="h-3 w-3" aria-hidden />
                {locale === "km" ? "ពិសេស" : "Featured"}
              </Badge>
            )}
          </div>
          {v.images.length > 1 && (
            <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
              {v.images.map((url, i) => (
                <button
                  key={url + i}
                  onClick={() => setImgIndex(i)}
                  className={cn(
                    "relative aspect-[4/3] overflow-hidden rounded-lg border-2 cursor-pointer",
                    i === imgIndex ? "border-amber-500" : "border-transparent opacity-75 hover:opacity-100"
                  )}
                  aria-label={`Photo ${i + 1}`}
                >
                  { }
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Specs */}
          <h2 className="mt-6 text-lg font-bold text-slate-900">{t("specifications")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {specs.map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                <dt className="text-[11px] text-slate-400">{s.label}</dt>
                <dd className="text-sm font-medium text-slate-800 mt-0.5">{s.value}</dd>
              </div>
            ))}
          </dl>

          {/* Documents */}
          <h2 className="mt-6 text-lg font-bold text-slate-900">{t("documents")}</h2>
          <ul className="mt-3 space-y-2">
            {v.documents.length === 0 && (
              <li className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-400">
                —
              </li>
            )}
            {v.documents.map((d) => (
              <li key={d.id ?? d.type} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                {docIcon(d.status)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{t(`doc${d.type}` as never)}</p>
                  {d.notes && <p className="text-xs text-slate-400 truncate">{d.notes}</p>}
                </div>
                {d.fileUrl && (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
                  >
                    <FileText className="h-3 w-3" aria-hidden />
                    {t("docViewFile")}
                  </a>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] shrink-0",
                    d.status === "VERIFIED" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    d.status === "PROVIDED" && "border-teal-200 bg-teal-50 text-teal-700",
                    d.status === "MISSING" && "border-slate-200 bg-slate-50 text-slate-400",
                    d.status === "REJECTED" && "border-rose-200 bg-rose-50 text-rose-700"
                  )}
                >
                  {t(`doc${d.status}` as never)}
                </Badge>
              </li>
            ))}
          </ul>

          {/* Description */}
          {desc && (
            <>
              <h2 className="mt-6 text-lg font-bold text-slate-900">{t("description")}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{desc}</p>
            </>
          )}
        </div>

        {/* ------- Right: price, seller, safety, AI report ------- */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h1 className="text-lg sm:text-xl font-bold leading-snug text-slate-900">{title}</h1>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="text-2xl sm:text-3xl font-bold text-amber-600">{formatUsd(v.priceUsd)}</span>
              <span className="text-sm text-slate-400">{formatKhr(v.priceUsd)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {v.district ? `${v.district}, ` : ""}
                {v.city}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {t("views", { n: v.views })}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" aria-hidden />
                {t("listedAgo", { t: timeAgo(v.createdAt, locale) })}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {v.sellerFull.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  {v.sellerFull.type === "DEALER" ? t("dealerBadge") : locale === "km" ? "អ្នកលក់ផ្ទៀងផ្ទាត់" : "Verified seller"}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                <FileCheck2 className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                {t("docsProvided", { n: v.trust.docsProvided })}
              </span>
              {v.trust.reportAvailable && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-semibold text-teal-700">
                  AI · {t("aiReportReady")}
                </span>
              )}
            </div>

            {/* CTAs */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                onClick={openAuthedDialog(() => setContactOpen(true))}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold h-11"
              >
                <MessageSquare className="h-4 w-4 mr-2" aria-hidden />
                {t("contactSeller")}
              </Button>
              <Button onClick={toggleFavorite} variant="outline" className="h-11" aria-pressed={isFav}>
                <Heart className={cn("h-4 w-4 mr-2", isFav && "fill-rose-500 text-rose-500")} aria-hidden />
                {isFav ? (locale === "km" ? "រក្សាទុករួច" : "Saved") : t("navFavorites")}
              </Button>
            </div>
            {v.status === "PUBLISHED" && (
              <Button
                onClick={openBuyDialog}
                className="mt-2 h-11 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                <Handshake className="h-4 w-4 mr-2" aria-hidden />
                {t("buyRequestBtn")}
              </Button>
            )}
            {v.status === "PUBLISHED" && (
              <Button
                onClick={openAuthedDialog(() => setTdOpen(true))}
                variant="outline"
                className="mt-2 h-11 w-full border-teal-200 text-teal-700 hover:bg-teal-50"
              >
                <CalendarClock className="h-4 w-4 mr-2" aria-hidden />
                {t("requestTestDrive")}
              </Button>
            )}
            {v.sellerFull.phone && (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                <span className="font-mono tracking-wide">{v.sellerFull.phone}</span>
              </p>
            )}
          </div>

          {/* Seller card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                  {sellerName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-semibold text-slate-900 truncate">
                    {sellerName}
                    {v.sellerFull.verified && <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />}
                  </p>
                  <p className="text-xs text-slate-500">
                    {v.sellerFull.type === "DEALER" ? t("dealerBadge") : t("privateBadge")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate({ name: "seller", userId: v.sellerFull.id })}>
                {t("viewStorefront")}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {t("ratingOf", { score: v.sellerFull.ratingAvg.toFixed(1), n: v.sellerFull.ratingCount })}
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" aria-hidden />
                {t("responseRate", { n: v.sellerFull.responseRate })}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden />
                {t("sellerSince", { y: new Date(v.sellerFull.memberSince).getFullYear() })}
              </span>
            </div>
            {v.sellerFull.telegram && (
              <a
                href={`https://t.me/${v.sellerFull.telegram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Telegram · {v.sellerFull.telegram}
              </a>
            )}
          </div>

          {/* AI report card */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <FileCheck2 className="h-5 w-5 text-teal-600" aria-hidden />
              {t("aiReportTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("aiReportBody")}</p>
            {v.report ? (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-teal-700">{Math.round(v.report.overallConfidence)}%</span>
                  <span className="text-xs text-slate-500">{t("confidence")}</span>
                </div>
                <Button
                  onClick={() => navigate({ name: "report", vehicleId: v.id })}
                  className="mt-3 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                >
                  <FileCheck2 className="h-4 w-4 mr-2" aria-hidden />
                  {t("viewFullReport")}
                </Button>
              </div>
            ) : (
              <Button
                onClick={generateReport}
                disabled={generating}
                className="mt-3 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                    {t("loading")}
                  </>
                ) : (
                  <>
                    <FileCheck2 className="h-4 w-4 mr-2" aria-hidden />
                    {t("generateReport")}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Safety */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="flex items-center gap-2 font-semibold text-amber-900">
              <ShieldAlert className="h-4.5 w-4.5" aria-hidden />
              {t("safetyTitle")}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-800">{t("safetyBody")}</p>
          </div>
        </div>
      </div>

      {/* Similar */}
      {data.similar.length > 0 && (
        <section className="mt-10" aria-labelledby="similar-title">
          <h2 id="similar-title" className="text-lg font-bold text-slate-900">{t("similarCars")}</h2>
          <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {data.similar.map((sv) => (
              <VehicleCard key={sv.id} vehicle={sv} showCompare={false} />
            ))}
          </div>
        </section>
      )}

      {/* Contact dialog */}
      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        vehicleId={v.id}
        sellerName={sellerName}
      />

      {/* Abuse report dialog */}
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        reason={reportReason}
        setReason={setReportReason}
        details={reportDetails}
        setDetails={setReportDetails}
        onSubmit={submitAbuse}
      />

      {/* Test drive appointment dialog */}
      <Dialog open={tdOpen} onOpenChange={setTdOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-600" aria-hidden />
              {t("testDriveTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="td-when" className="text-xs text-slate-500">{t("testDriveWhen")}</Label>
              <input
                id="td-when"
                type="datetime-local"
                value={tdWhen}
                min={localInputValue(new Date(Date.now() + 60 * 60 * 1000))}
                onChange={(e) => setTdWhen(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <Label htmlFor="td-notes" className="text-xs text-slate-500">{t("testDriveNotes")}</Label>
              <Textarea id="td-notes" value={tdNotes} onChange={(e) => setTdNotes(e.target.value)} rows={3} maxLength={300} className="mt-1.5" />
              <p className="mt-1 text-right text-[10px] text-slate-300">{tdNotes.length}/300</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTdOpen(false)}>{t("cancel")}</Button>
            <Button
              size="sm"
              onClick={submitTestDrive}
              disabled={tdSubmitting || !tdWhen}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
            >
              {tdSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
              {t("testDriveSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase request dialog */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-emerald-600" aria-hidden />
              {t("buyRequestTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{t("buyRequestBody")}</p>
            <p className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
              {title} · <span className="text-amber-600">{formatUsd(v.priceUsd)}</span>
            </p>
            <div>
              <Label htmlFor="buy-msg" className="text-xs text-slate-500">{t("buyMessageLabel")}</Label>
              <Textarea id="buy-msg" value={buyMessage} onChange={(e) => setBuyMessage(e.target.value)}
                placeholder={t("buyMessagePlaceholder")} rows={3} maxLength={500} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBuyOpen(false)}>{t("cancel")}</Button>
            <Button size="sm" onClick={submitBuyRequest} disabled={buySubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              {buySubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
              {t("buyRequestBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky mobile CTA bar */}
      <div className="fixed bottom-[52px] inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur p-2.5 md:hidden">
        <div className="flex gap-2 max-w-md mx-auto">
          <Button
            onClick={openAuthedDialog(() => setContactOpen(true))}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold h-11"
          >
            <Send className="h-4 w-4 mr-2" aria-hidden />
            {t("contactSeller")}
          </Button>
          <Button onClick={toggleFavorite} variant="outline" size="icon" className="h-11 w-11" aria-label={t("navFavorites")}>
            <Heart className={cn("h-5 w-5", isFav && "fill-rose-500 text-rose-500")} aria-hidden />
          </Button>
          {v.report && (
            <Button
              onClick={() => navigate({ name: "report", vehicleId: v.id })}
              variant="outline"
              size="icon"
              className="h-11 w-11 border-teal-300 text-teal-700"
              aria-label={t("viewFullReport")}
            >
              <RefreshCw className="hidden" aria-hidden />
              <FileCheck2 className="h-5 w-5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportDialog({
  open,
  onOpenChange,
  reason,
  setReason,
  details,
  setDetails,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason: (typeof ABUSE_REASONS)[number];
  setReason: (r: (typeof ABUSE_REASONS)[number]) => void;
  details: string;
  setDetails: (d: string) => void;
  onSubmit: () => void;
}) {
  const t = useT();
  const reasonLabels: Record<string, string> = {
    SCAM: "Scam / បញ្ឆោត",
    WRONG_INFO: "Wrong information / ព័ត៌មានខុស",
    DUPLICATE: "Duplicate / ស្ទួន",
    OFFENSIVE: "Offensive / មិនសមរម្យ",
    SOLD: "Already sold / លក់រួច",
    OTHER: "Other / ផ្សេងៗ",
  };
  return (
    <ReportDialogWrapper open={open} onOpenChange={onOpenChange} onSubmit={onSubmit}>
      <p className="text-sm font-medium text-slate-700 mb-2">{t("reportReason")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ABUSE_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              reason === r
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            )}
            aria-pressed={reason === r}
          >
            {reasonLabels[r]}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        placeholder={t("reportDetails")}
        className="mt-3 w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
    </ReportDialogWrapper>
  );
}

function ReportDialogWrapper({
  open,
  onOpenChange,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-500" aria-hidden />
            {t("reportListing")}
          </DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("prevStep")}
          </Button>
          <Button size="sm" onClick={onSubmit} className="bg-rose-600 hover:bg-rose-700 text-white">
            {t("reportSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
