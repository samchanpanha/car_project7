"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { ReportDTO, VehicleDetailDTO, VehicleCardDTO } from "@/lib/types";
import { StatusLegend } from "@/components/marketplace/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Bike, CircleSlash, FileCheck2, Loader2, MessageSquare, RefreshCw, ShieldAlert, TriangleAlert, Wrench,
} from "lucide-react";
import { useState } from "react";
import { formatUsd, timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ReportView({ vehicleId }: { vehicleId: string }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);

  const { data: vehicleData, loading: vLoading, error: vError } = useFetch<{ vehicle: VehicleDetailDTO }>(
    `/api/vehicles/${vehicleId}`
  );
  const { data: reportData, loading: rLoading, error: rError, refetch } = useFetch<{ report: ReportDTO | null }>(
    `/api/vehicles/${vehicleId}/report`
  );
  const [regenerating, setRegenerating] = useState(false);
  const [disputed, setDisputed] = useState(false);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await apiSend(`/api/vehicles/${vehicleId}/report`, "POST");
      toast.success(locale === "km" ? "បង្កើតរបាយការណ៍បានជោគជ័យ" : "Report regenerated");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setRegenerating(false);
    }
  };

  const loading = vLoading || (rLoading && !reportData);
  const error = vError || rError;

  if (loading && !reportData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24 md:pb-10 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !vehicleData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center pb-24 md:pb-10">
        <TriangleAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <p className="mt-3 text-slate-600">{error || t("errorGeneric")}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate({ name: "detail", vehicleId })}>
          {t("backToResults")}
        </Button>
      </div>
    );
  }

  const report = reportData?.report ?? null;
  const vehicle = vehicleData?.vehicle;

  if (!vehicle) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center pb-24 md:pb-10">
        <TriangleAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <p className="mt-3 text-slate-600">{t("errorGeneric")}</p>
      </div>
    );
  }

  const isMotor = vehicle.listingCategory === "MOTOR";
  const isPart = vehicle.listingCategory === "SPARE_PART";
  const reportTitle = isPart ? t("aiReportPartTitle") : isMotor ? t("aiReportMotorTitle") : t("aiReportTitle");
  const reportBody = isPart ? t("aiReportPartBody") : isMotor ? t("aiReportMotorBody") : t("aiReportBody");

  if (!report) {
    // No report yet — offer to generate one
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24 md:pb-10">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate({ name: "detail", vehicleId })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden />
          {t("backToResults")}
        </Button>
        <div
          className={cn(
            "mt-6 rounded-2xl border p-8 text-center",
            isPart
              ? "border-amber-200 bg-amber-50/60"
              : isMotor
              ? "border-sky-200 bg-sky-50/60"
              : "border-teal-200 bg-teal-50/60"
          )}
        >
          {isPart ? (
            <Wrench className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
          ) : isMotor ? (
            <Bike className="mx-auto h-10 w-10 text-sky-600" aria-hidden />
          ) : (
            <FileCheck2 className="mx-auto h-10 w-10 text-teal-600" aria-hidden />
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{reportTitle}</h1>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">{reportBody}</p>
          <Button
            onClick={regenerate}
            disabled={regenerating}
            className={cn(
              "mt-5 text-white font-semibold",
              isPart
                ? "bg-amber-600 hover:bg-amber-700"
                : isMotor
                ? "bg-sky-600 hover:bg-sky-700"
                : "bg-teal-600 hover:bg-teal-700"
            )}
          >
            {regenerating ? (
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
        </div>
      </div>
    );
  }

  const summary = locale === "km" ? report.summaryKm : report.summaryEn;
  const title = isPart
    ? `${vehicle.make} ${vehicle.model}${vehicle.partNumber ? ` (${vehicle.partNumber})` : ""}`
    : `${vehicle.make} ${vehicle.model} ${vehicle.year}`.trim();
  const counts = report.checks.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const subtitleMeta = isPart
    ? `${vehicle.partCategory ? `${vehicle.partCategory} · ` : ""}${formatUsd(vehicle.priceUsd)} · ${t("reportGenerated", { t: timeAgo(report.createdAt, locale) })}`
    : isMotor
    ? `${vehicle.engineCc ? `${vehicle.engineCc}cc · ` : ""}${formatUsd(vehicle.priceUsd)} · ${t("reportGenerated", { t: timeAgo(report.createdAt, locale) })}`
    : `${formatUsd(vehicle.priceUsd)} · ${t("reportGenerated", { t: timeAgo(report.createdAt, locale) })}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 pb-24 md:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate({ name: "detail", vehicleId })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden />
          {title}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={regenerate}
          disabled={regenerating}
          className={cn(
            "border",
            isPart
              ? "border-amber-300 text-amber-800 hover:bg-amber-50"
              : isMotor
              ? "border-sky-300 text-sky-700 hover:bg-sky-50"
              : "border-teal-300 text-teal-700 hover:bg-teal-50"
          )}
        >
          {regenerating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />}
          {t("regenerate")}
        </Button>
      </div>

      {/* Summary card */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="report-summary">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="shrink-0">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.93 0 0)" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={report.overallConfidence >= 70 ? "oklch(0.6 0.13 163)" : report.overallConfidence >= 45 ? "oklch(0.7 0.12 75)" : "oklch(0.65 0.18 45)"}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(report.overallConfidence / 100) * 264} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-slate-900">{Math.round(report.overallConfidence)}%</span>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="report-summary" className="text-lg font-bold text-slate-900">{reportTitle}</h1>
              {isPart && (
                <span className="rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5">
                  OEM / Part
                </span>
              )}
              {isMotor && (
                <span className="rounded-full bg-sky-100 text-sky-800 text-[11px] font-semibold px-2 py-0.5">
                  Motorcycle
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {title} · {subtitleMeta}
            </p>
            <p className="mt-2 text-[11px] text-slate-400 flex flex-wrap gap-x-2">
              {Object.entries(counts).map(([status, n]) => (
                <span key={status}>
                  {n}× {t(`legend${status}` as never)}
                </span>
              ))}
            </p>
          </div>
        </div>
        {summary && (
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{t("summary")}</p>
            <p className="text-sm leading-relaxed text-slate-700">{summary}</p>
          </div>
        )}
        <div className="mt-4">
          <p className="mb-1 text-xs text-slate-400">{t("confidence")}</p>
          <Progress value={report.overallConfidence} className="h-1.5" aria-label={`${t("confidence")}: ${report.overallConfidence}%`} />
        </div>
      </section>

      {/* How to read */}
      <section className="mt-5" aria-labelledby="howto">
        <h2 id="howto" className="text-sm font-bold text-slate-900 mb-2.5">{t("howToRead")}</h2>
        <StatusLegend />
      </section>

      {/* Checks */}
      <section className="mt-6" aria-labelledby="checks">
        <h2 id="checks" className="text-base font-bold text-slate-900 mb-3">{t("checks", { n: report.checks.length })}</h2>
        <ul className="space-y-2.5">
          {report.checks.map((c) => {
            const statusKey = c.status as "VERIFIED" | "EVIDENCE_FOUND" | "INCONSISTENT" | "NOT_VERIFIED" | "NO_DATA";
            const badgeCls = {
              VERIFIED: "border-emerald-200 bg-emerald-50",
              EVIDENCE_FOUND: "border-teal-200 bg-teal-50",
              INCONSISTENT: "border-amber-300 bg-amber-50",
              NOT_VERIFIED: "border-slate-200 bg-slate-50",
              NO_DATA: "border-slate-200 bg-slate-50/60",
            }[statusKey];
            return (
              <li key={c.area} className={cn("rounded-xl border p-4", badgeCls)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {locale === "km" ? c.titleKm : c.title}
                  </h3>
                  <StatusPill status={statusKey} />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {locale === "km" ? c.detailKm : c.detail}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <CircleSlash className="h-3 w-3" aria-hidden />
                    {t("checkSource")}: {c.source}
                  </span>
                  <span>
                    {t("confidence")}: {Math.round(c.confidence * 100)}%
                  </span>
                </div>
                {/* thin confidence bar */}
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      statusKey === "VERIFIED" ? "bg-emerald-500" :
                      statusKey === "EVIDENCE_FOUND" ? "bg-teal-500" :
                      statusKey === "INCONSISTENT" ? "bg-amber-500" :
                      statusKey === "NOT_VERIFIED" ? "bg-slate-400" : "bg-slate-300"
                    )}
                    style={{ width: `${Math.max(4, Math.round(c.confidence * 100))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Limitations */}
      <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="limits">
        <h2 id="limits" className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <ShieldAlert className="h-4.5 w-4.5" aria-hidden />
          {t("limitations")}
        </h2>
        <ul className="mt-2.5 space-y-1.5">
          {report.limitations.map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-amber-900">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
              {locale === "km" ? l.km : l.en}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-amber-200 pt-3 text-xs leading-relaxed text-amber-800">
          {t("reportDisclaimer")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disputed}
            onClick={() => {
              setDisputed(true);
              toast.success(t("disputeThanks"));
            }}
            className="border-amber-400 text-amber-800 hover:bg-amber-100"
          >
            {t("disputeButton")}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate({ name: "detail", vehicleId })}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            <MessageSquare className="h-4 w-4 mr-2" aria-hidden />
            {t("contactSeller")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: "VERIFIED" | "EVIDENCE_FOUND" | "INCONSISTENT" | "NOT_VERIFIED" | "NO_DATA" }) {
  const t = useT();
  const styles: Record<string, string> = {
    VERIFIED: "bg-emerald-600 text-white",
    EVIDENCE_FOUND: "bg-teal-600 text-white",
    INCONSISTENT: "bg-amber-500 text-slate-950",
    NOT_VERIFIED: "bg-slate-500 text-white",
    NO_DATA: "bg-slate-300 text-slate-700",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap", styles[status])}>
      {t(`legend${status}` as never)}
    </span>
  );
}
