"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { VehicleDetailDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, X } from "lucide-react";
import { formatKhr, formatMileage, formatUsd } from "@/lib/format";
import { bodyTypeLabels, drivetrainLabels, fuelLabels, transmissionLabels } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function CompareColumn({ vehicleId }: { vehicleId: string }) {
  const { data, loading } = useFetch<{ vehicle: VehicleDetailDTO }>(`/api/vehicles/${vehicleId}`);
  if (loading && !data) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  }
  const v = data?.vehicle;
  if (!v) return <p className="p-4 text-sm text-slate-400">—</p>;
  return (
    <div className="p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
        {v.images[0] && (
           
          <img src={v.images[0]} alt={`${v.make} ${v.model}`} className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <p className="mt-2.5 text-sm font-semibold text-slate-900 leading-snug">
        {v.make} {v.model} {v.variant ?? ""}
      </p>
      <p className="mt-0.5 text-base font-bold text-amber-600">{formatUsd(v.priceUsd)}</p>
      <p className="text-[11px] text-slate-400">{formatKhr(v.priceUsd)}</p>
    </div>
  );
}

export function CompareView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const compare = useAppStore((s) => s.compare);
  const removeCompare = useAppStore((s) => s.toggleCompare);
  const clearCompare = useAppStore((s) => s.clearCompare);

  if (compare.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 pb-28 md:pb-10 text-center">
        <Scale className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-lg font-bold text-slate-900">{t("compareEmpty")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("compareEmptyHint")}</p>
        <Button onClick={() => navigate({ name: "browse" })} className="mt-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
          {t("navBrowse")}
        </Button>
      </div>
    );
  }

  const rows: Array<{ label: string; render: (v: VehicleDetailDTO) => string }> = [
    { label: t("formPrice"), render: (v) => formatUsd(v.priceUsd) },
    { label: t("specYear"), render: (v) => String(v.year) },
    { label: t("specMileage"), render: (v) => formatMileage(v.mileageKm, locale) },
    { label: t("specTransmission"), render: (v) => transmissionLabels[v.transmission]?.[locale] ?? v.transmission },
    { label: t("specFuel"), render: (v) => fuelLabels[v.fuel]?.[locale] ?? v.fuel },
    { label: t("specEngine"), render: (v) => (v.engineCc ? `${v.engineCc} cc` : "—") },
    { label: t("specDrivetrain"), render: (v) => (v.drivetrain ? drivetrainLabels[v.drivetrain]?.[locale] ?? v.drivetrain : "—") },
    { label: t("specBody"), render: (v) => bodyTypeLabels[v.bodyType]?.[locale] ?? v.bodyType },
    { label: t("specAccident"), render: (v) => t(`accident${v.accidentDeclared}` as never) },
    { label: t("specOwnerCount"), render: (v) => (v.ownershipCount != null ? String(v.ownershipCount) : "—") },
    { label: t("specImport"), render: (v) => v.importOrigin ?? "—" },
    { label: t("documents"), render: (v) => `${v.trust.docsProvided}` },
    { label: "AI", render: (v) => (v.trust.reportAvailable ? "✓" : "—") },
    {
      label: t("sellerType"),
      render: (v) => `${v.sellerFull.type === "DEALER" ? t("dealer") : t("privateSeller")}${v.sellerFull.verified ? " ✓" : ""}`,
    },
    { label: t("location"), render: (v) => `${v.district ? v.district + ", " : ""}${v.city}` },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("compareTitle")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearCompare} className="text-slate-500">
            {t("clearFilters")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ name: "browse" })}>
            {t("navBrowse")}
          </Button>
        </div>
      </div>

      <div
        className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white"
        style={{ scrollbarWidth: "thin" }}
      >
        <table className="w-full min-w-[560px] text-sm" role="table">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="w-28 p-3 text-left text-xs font-medium text-slate-400" scope="col" aria-label="Spec" />
              {compare.map((id) => (
                <th key={id} scope="col" className="p-0 text-left align-top border-l border-slate-100 min-w-[190px]">
                  <div className="relative">
                    <button
                      onClick={() => removeCompare(id)}
                      className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 border border-slate-200 text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label={t("remove")}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <CompareColumn vehicleId={id} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.label} className={cn(ri % 2 === 1 && "bg-slate-50/60")}>
                <th scope="row" className="p-3 text-left text-xs font-medium text-slate-500 whitespace-nowrap">
                  {row.label}
                </th>
                {compare.map((id) => (
                  <td key={id} className="p-3 border-l border-slate-100 text-slate-800">
                    <RowValue vehicleId={id} render={row.render} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowValue({
  vehicleId,
  render,
}: {
  vehicleId: string;
  render: (v: VehicleDetailDTO) => string;
}) {
  const { data } = useFetch<{ vehicle: VehicleDetailDTO }>(`/api/vehicles/${vehicleId}`);
  if (!data) return <span className="text-slate-300">…</span>;
  return <span>{render(data.vehicle)}</span>;
}
