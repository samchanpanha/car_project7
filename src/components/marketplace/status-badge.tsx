"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import type { Locale } from "@/lib/i18n";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShieldCheck, FileSearch, TriangleAlert, CircleHelp, CircleSlash } from "lucide-react";

export const STATUS_STYLES: Record<
  ReportStatus,
  { label: DictKeyLabel; icon: typeof ShieldCheck; chip: string; dot: string }
> = {
  VERIFIED: {
    label: "legendVERIFIED",
    icon: ShieldCheck,
    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
  },
  EVIDENCE_FOUND: {
    label: "legendEVIDENCE_FOUND",
    icon: FileSearch,
    chip: "bg-teal-100 text-teal-800 border-teal-200",
    dot: "bg-teal-500",
  },
  INCONSISTENT: {
    label: "legendINCONSISTENT",
    icon: TriangleAlert,
    chip: "bg-amber-100 text-amber-900 border-amber-300",
    dot: "bg-amber-500",
  },
  NOT_VERIFIED: {
    label: "legendNOT_VERIFIED",
    icon: CircleHelp,
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  NO_DATA: {
    label: "legendNO_DATA",
    icon: CircleSlash,
    chip: "bg-slate-50 text-slate-500 border-slate-200",
    dot: "bg-slate-300",
  },
};

type DictKeyLabel =
  | "legendVERIFIED"
  | "legendEVIDENCE_FOUND"
  | "legendINCONSISTENT"
  | "legendNOT_VERIFIED"
  | "legendNO_DATA";

export function ReportStatusBadge({
  status,
  short,
  className,
}: {
  status: ReportStatus;
  short?: boolean;
  className?: string;
}) {
  const locale = useAppStore((s) => s.locale);
  const t = useT();
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        style.chip,
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {short ? shortLabel(status, locale) : t(style.label)}
    </span>
  );
}

function shortLabelEn(status: ReportStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "EVIDENCE_FOUND":
      return "Evidence";
    case "INCONSISTENT":
      return "Inconsistent";
    case "NOT_VERIFIED":
      return "Not verified";
    default:
      return "No data";
  }
}
function shortLabelKm(status: ReportStatus): string {
  switch (status) {
    case "VERIFIED":
      return "បានផ្ទៀងផ្ទាត់";
    case "EVIDENCE_FOUND":
      return "មានភស្តុតាង";
    case "INCONSISTENT":
      return "មិនប្រក្រតី";
    case "NOT_VERIFIED":
      return "មិនបានផ្ទៀងផ្ទាត់";
    default:
      return "គ្មានទិន្នន័យ";
  }
}
function shortLabelZh(status: ReportStatus): string {
  switch (status) {
    case "VERIFIED":
      return "已核实";
    case "EVIDENCE_FOUND":
      return "有证据";
    case "INCONSISTENT":
      return "存疑";
    case "NOT_VERIFIED":
      return "未核实";
    default:
      return "无数据";
  }
}
function shortLabelVi(status: ReportStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Đã xác minh";
    case "EVIDENCE_FOUND":
      return "Có bằng chứng";
    case "INCONSISTENT":
      return "Mâu thuẫn";
    case "NOT_VERIFIED":
      return "Chưa xác minh";
    default:
      return "Không có dữ liệu";
  }
}
/** Compact badge label per locale (Task 19: zh/vi added, others fall back). */
function shortLabel(status: ReportStatus, locale: Locale): string {
  if (locale === "km") return shortLabelKm(status);
  if (locale === "zh") return shortLabelZh(status);
  if (locale === "vi") return shortLabelVi(status);
  return shortLabelEn(status);
}

/** Status legend strip shown on the report page */
export function StatusLegend() {
  const t = useT();
  const statuses: ReportStatus[] = ["VERIFIED", "EVIDENCE_FOUND", "INCONSISTENT", "NOT_VERIFIED", "NO_DATA"];
  const hints: Record<ReportStatus, string> = {
    VERIFIED: t("legendVERIFIEDHint"),
    EVIDENCE_FOUND: t("legendEVIDENCE_FOUNDHint"),
    INCONSISTENT: t("legendINCONSISTENTHint"),
    NOT_VERIFIED: t("legendNOT_VERIFIEDHint"),
    NO_DATA: t("legendNO_DATAHint"),
  };
  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" role="list" aria-label={t("howToRead")}>
      {statuses.map((s) => {
        const style = STATUS_STYLES[s];
        const Icon = style.icon;
        return (
          <div key={s} role="listitem" className="rounded-lg border border-slate-200 bg-white p-2.5">
            <ReportStatusBadge status={s} />
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{hints[s]}</p>
            <Icon className="sr-only" aria-hidden />
          </div>
        );
      })}
    </div>
  );
}
