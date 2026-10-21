"use client";

// Shared small building blocks for all role-aware dashboards (Task 5-c).
// Palette follows existing views: slate / amber / emerald / teal / rose — no indigo/blue.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import type { Locale } from "@/lib/i18n";
import type { AppointmentStatus, TenantRole, UserRole } from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------- badges ----------

export function RoleBadge({ role }: { role: UserRole }) {
  const t = useT();
  const cls =
    role === "SUPER_ADMIN"
      ? "bg-amber-100 text-amber-900 border-amber-300"
      : role === "ADMIN"
        ? "bg-rose-100 text-rose-800 border-rose-200"
        : role === "DEALER"
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : role === "SELLER"
            ? "bg-teal-100 text-teal-800 border-teal-200"
            : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", cls)}>
      {t(`role${role}` as never)}
    </Badge>
  );
}

export function TenantRoleBadge({ role }: { role: TenantRole }) {
  const t = useT();
  return (
    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
      {t(`trole${role}` as never)}
    </Badge>
  );
}

const VER_STYLES: Record<string, string> = {
  VERIFIED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-900 border-amber-300",
  UNVERIFIED: "bg-slate-100 text-slate-600 border-slate-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
};

export function VerificationBadge({ verification }: { verification: string }) {
  const t = useT();
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", VER_STYLES[verification] ?? VER_STYLES.UNVERIFIED)}>
      {t(`ver${verification}` as never)}
    </Badge>
  );
}

const TENANT_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  SUSPENDED: "bg-rose-100 text-rose-800 border-rose-200",
};

export function TenantStatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", TENANT_STYLES[status] ?? TENANT_STYLES.ACTIVE)}>
      {t(`tst${status}` as never)}
    </Badge>
  );
}

const VEHICLE_STATUS_STYLES: Record<VehicleStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  PENDING_REVIEW: "bg-amber-100 text-amber-900 border-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  SOLD: "bg-slate-800 text-white border-slate-800",
  ARCHIVED: "bg-slate-100 text-slate-400 border-slate-200",
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const t = useT();
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", VEHICLE_STATUS_STYLES[status])}>
      {t(`vst${status}` as never)}
    </Badge>
  );
}

const APPT_STATUS_STYLES: Record<AppointmentStatus, string> = {
  REQUESTED: "bg-amber-100 text-amber-900 border-amber-300",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  COMPLETED: "bg-teal-100 text-teal-800 border-teal-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useT();
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", APPT_STATUS_STYLES[status])}>
      {t(`ast${status}` as never)}
    </Badge>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  const t = useT();
  return (
    <Badge variant="outline" className="text-[10px] font-semibold bg-amber-100 text-amber-900 border-amber-300">
      {t("subCurrentPlan")}: {plan}
    </Badge>
  );
}

// ---------- stat / sections / empty ----------

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? label : undefined}
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4",
        clickable && "cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 truncate">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2.5 h-7 w-20" />
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 md:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  text,
  hint,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center", className)}>
      <Icon className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
      <p className="mt-3 text-sm font-medium text-slate-700">{text}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function FetchErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
      <p className="text-sm text-rose-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-xs font-semibold text-rose-800 underline underline-offset-2 cursor-pointer">
          {t("retry")}
        </button>
      )}
    </div>
  );
}

// ---------- mini charts ----------

/** Pure-CSS grouped bar chart (no chart lib) for small trend arrays. */
export function MiniBarChart({
  points,
  seriesA,
  seriesB,
  labelA,
  labelB,
  className,
}: {
  points: { label: string; a: number; b: number }[];
  seriesA: string; // css color class, e.g. "bg-emerald-500"
  seriesB: string;
  labelA: string;
  labelB: string;
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.a, p.b)));
  return (
    <div className={className} role="img" aria-label={`${labelA} / ${labelB}`}>
      <div className="flex items-end gap-2 h-28">
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5">
              <div
                className={cn("w-2.5 rounded-t sm:w-3.5", seriesA)}
                style={{ height: `${Math.max(3, (p.a / max) * 100)}%` }}
                title={`${labelA}: ${p.a}`}
              />
              <div
                className={cn("w-2.5 rounded-t sm:w-3.5", seriesB)}
                style={{ height: `${Math.max(3, (p.b / max) * 100)}%` }}
                title={`${labelB}: ${p.b}`}
              />
            </div>
            <span className="mt-1 truncate text-center text-[9px] text-slate-400">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className={cn("inline-block h-2 w-2 rounded-sm", seriesA)} aria-hidden />
          {labelA}
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("inline-block h-2 w-2 rounded-sm", seriesB)} aria-hidden />
          {labelB}
        </span>
      </div>
    </div>
  );
}

/** Horizontal labeled bar (for status breakdowns). */
export function HBar({
  label,
  value,
  total,
  colorClass,
}: {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-28 shrink-0 truncate text-xs text-slate-600">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", colorClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700 tabular-nums">{value}</span>
    </div>
  );
}

/** SVG confidence ring — same pattern as the report view. */
export function ConfidenceRing({ value, size = 64 }: { value: number; size?: number }) {
  const stroke = value >= 70 ? "oklch(0.6 0.13 163)" : value >= 45 ? "oklch(0.7 0.12 75)" : "oklch(0.65 0.18 45)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" style={{ width: size, height: size }} aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.93 0 0)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r="42" fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, Math.max(0, value)) / 100) * 264} 264`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-900">{Math.round(value)}%</span>
      </div>
    </div>
  );
}

// ---------- misc helpers ----------

/** Absolute datetime, bilingual. Only called on client with fetched data (no SSR hydration risk). */
export function formatDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return locale === "km" ? `${date} ម៉ោង ${time}` : `${date} · ${time}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

export function AvatarCircle({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white",
        className
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** True when the error looks like a permissions problem (403 etc.). */
export function isForbidden(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /\b403\b|forbidden|permission|not allowed|unauthor/i.test(msg);
}

/** True when the error looks like a featured-limit business error (400). */
export function isFeaturedLimit(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /featured/i.test(msg) || (/limit|exceed/i.test(msg) && /\b400\b/i.test(msg));
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Request failed";
}
