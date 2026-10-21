"use client";

// Super Admin / Admin dashboard — platform KPIs, moderation, users, AI stats, settings, audit.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend, qs } from "@/lib/client-hooks";
import { formatUsd, timeAgo } from "@/lib/format";
import type {
  AdminOverviewDTO,
  AdminTenantDTO,
  AdminVehicleRowDTO,
  AdminUserDTO,
  AiStatsDTO,
  AuditEntryDTO,
  PlatformSettingsDTO,
  SessionDTO,
} from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";
import type { SubscriptionPaymentDTO } from "@/lib/commerce-types";
import { DashboardShell, type DashboardTabDef } from "./shell";
import {
  AvatarCircle, ConfidenceRing, EmptyState, FetchErrorState, HBar, MiniBarChart, PaymentStatusBadge,
  RoleBadge, SectionCard, StatCard, StatCardSkeleton, TenantStatusBadge, VehicleStatusBadge,
  VerificationBadge, errorText, isForbidden,
} from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BadgeCheck, Car, ChevronDown, CreditCard, DollarSign, FileCheck2, Gauge, Hourglass, Image as ImageIcon,
  LayoutDashboard, Loader2, MessageSquare, MoreHorizontal, ScrollText, Send, Settings, ShieldCheck, Sparkles,
  Star, Store, TriangleAlert, Upload, Users, Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fileToDataUrl } from "@/lib/image-client";
import type { PlanPricingConfig } from "@/lib/api/plan-config";

const VEHICLE_STATUSES: VehicleStatus[] = ["PUBLISHED", "PENDING_REVIEW", "DRAFT", "SOLD", "REJECTED", "ARCHIVED"];

const STATUS_BAR_COLORS: Record<VehicleStatus, string> = {
  PUBLISHED: "bg-emerald-500",
  PENDING_REVIEW: "bg-amber-400",
  DRAFT: "bg-slate-300",
  SOLD: "bg-slate-800",
  REJECTED: "bg-rose-500",
  ARCHIVED: "bg-slate-300",
};

export function AdminDashboard({ me }: { me: SessionDTO }) {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const active = (view.name === "dashboard" && view.tab) || "overview";
  const setTab = (tab: string) => navigate({ name: "dashboard", tab });

  const tabs: DashboardTabDef[] = [
    { id: "overview", label: t("tabOverview"), icon: LayoutDashboard },
    { id: "tenants", label: t("tabTenants"), icon: Store },
    { id: "listings", label: t("tabListings"), icon: Car },
    { id: "users", label: t("tabUsers"), icon: Users },
    { id: "payments", label: t("tabPayments"), icon: CreditCard },
    { id: "ai", label: t("tabAi"), icon: Sparkles },
    { id: "settings", label: t("tabSettings"), icon: Settings },
    { id: "audit", label: t("tabAudit"), icon: ScrollText },
  ];

  return (
    <DashboardShell
      greeting={t("dashboardWelcome", { name: me.user.name })}
      subtitle={t("dashboardAdminSub")}
      badge={<RoleBadge role={me.user.role} />}
      tabs={tabs}
      active={active}
      onTab={setTab}
    >
      {active === "overview" && <AdminOverview />}
      {active === "tenants" && <AdminTenants />}
      {active === "listings" && <AdminListings />}
      {active === "users" && <AdminUsers />}
      {active === "payments" && <AdminPayments />}
      {active === "ai" && <AdminAi />}
      {active === "settings" && <AdminSettings />}
      {active === "audit" && <AdminAudit />}
    </DashboardShell>
  );
}

// ---------------- overview ----------------

function AdminOverview() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<AdminOverviewDTO>("/api/admin/overview");

  if (loading && !data) {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </>
    );
  }
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const k = data.kpis;
  const statusTotal = Object.values(data.listingsByStatus).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label={t("kpiUsers")} value={k.users} />
        <StatCard icon={Store} label={t("kpiTenants")} value={k.tenants} />
        <StatCard icon={Car} label={t("kpiListings")} value={k.listingsPublished} />
        <StatCard icon={Hourglass} label={t("kpiPending")} value={k.listingsPending} />
        <StatCard icon={FileCheck2} label={t("kpiReports")} value={k.reportsGenerated} />
        <StatCard icon={MessageSquare} label={t("kpiConversations")} value={k.conversations} />
        <StatCard icon={BadgeCheck} label={t("kpiFavorites")} value={k.favorites} />
        <StatCard icon={DollarSign} label={t("kpiMrr")} value={formatUsd(k.mrrUsd)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("listingsByStatus")}>
          <div className="space-y-3">
            {VEHICLE_STATUSES.map((s) => (
              <HBar
                key={s}
                label={t(`vst${s}` as never)}
                value={data.listingsByStatus[s] ?? 0}
                total={statusTotal}
                colorClass={STATUS_BAR_COLORS[s]}
              />
            ))}
          </div>
        </SectionCard>
        <SectionCard title={t("signupTrend")}>
          {data.signupTrend.length === 0 ? (
            <EmptyState icon={Gauge} text={t("noResults")} />
          ) : (
            <MiniBarChart
              points={data.signupTrend.map((p) => ({ label: p.label, a: p.users, b: p.listings }))}
              seriesA="bg-emerald-500"
              seriesB="bg-amber-400"
              labelA={t("kpiUsers")}
              labelB={t("kpiListings")}
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("topTenants")}>
          {data.topTenants.length === 0 ? (
            <EmptyState icon={Store} text={t("noResults")} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topTenants.map((tt) => (
                <li key={tt.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{tt.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {tt.plan} · {t("kpiListings")} {tt.listings}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-600 tabular-nums">{tt.views}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={t("recentActivity")}>
          {data.recentAudit.length === 0 ? (
            <EmptyState icon={ScrollText} text={t("auditEmpty")} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentAudit.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 truncate text-xs">
                    <code className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{a.action}</code>
                    <span className="text-slate-500">{a.entity}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(a.createdAt, "en")}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

// ---------------- tenants ----------------

function AdminTenants() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<AdminTenantDTO[]>("/api/admin/tenants");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extending, setExtending] = useState<{ id: string; name: string } | null>(null);
  const [extendMonths, setExtendMonths] = useState("1");
  const [extendNote, setExtendNote] = useState("");
  const [extendingBusy, setExtendingBusy] = useState(false);

  const submitExtend = async () => {
    if (!extending) return;
    const months = Number(extendMonths);
    if (!Number.isInteger(months) || months < 1 || months > 36) return;
    setExtendingBusy(true);
    try {
      await apiSend("/api/admin/subscriptions/extend", "POST", {
        tenantId: extending.id,
        months,
        note: extendNote.trim() || undefined,
      });
      toast.success(t("subExtendedToast"));
      setExtending(null);
      setExtendMonths("1");
      setExtendNote("");
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setExtendingBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, string>) => {
    setBusyId(id);
    try {
      await apiSend(`/api/admin/tenants/${id}`, "PATCH", body);
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  }
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={Store} text={t("noResults")} />;

  return (
    <div className="space-y-3">
      {data.map((tt) => (
        <div key={tt.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="truncate">{tt.name}</span>
                <VerificationBadge verification={tt.verification} />
                <TenantStatusBadge status={tt.status} />
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {tt.slug} · {tt.city} · {t("sellerSince", { y: new Date(tt.createdAt).getFullYear() })}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={busyId === tt.id} aria-label={`${t("actions")} ${tt.name}`}>
                  {busyId === tt.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
                  <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => patch(tt.id, { verification: "VERIFIED" })}>{t("actVerify")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch(tt.id, { verification: "PENDING" })}>{t("actSetPending")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch(tt.id, { verification: "REJECTED" })} className="text-rose-600 focus:text-rose-700">
                  {t("actReject")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => patch(tt.id, { status: "SUSPENDED" })} className="text-rose-600 focus:text-rose-700">
                  {t("actSuspend")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch(tt.id, { status: "ACTIVE" })}>{t("actActivate")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setExtending({ id: tt.id, name: tt.name })}>{t("subManualExtend")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] text-slate-400">{t("tabStaff")}</p>
              <p className="font-semibold text-slate-700">{tt.memberCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] text-slate-400">{t("kpiListings")}</p>
              <p className="font-semibold text-slate-700">{tt.listingCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] text-slate-400">{t("tabSubscription")}</p>
              <p className="font-semibold text-slate-700">{tt.plan ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] text-slate-400">{t("kpiMrr")}</p>
              <p className="font-semibold text-slate-700">{formatUsd(tt.mrrUsd)}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Manual subscription extension dialog */}
      <Dialog open={Boolean(extending)} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("subManualExtend")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{extending?.name}</p>
            <div>
              <Label htmlFor="ext-months" className="text-xs text-slate-500">{t("subExtendMonths")}</Label>
              <Input id="ext-months" type="number" min={1} max={36} value={extendMonths}
                onChange={(e) => setExtendMonths(e.target.value)} className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="ext-note" className="text-xs text-slate-500">{t("subExtendNote")}</Label>
              <Textarea id="ext-note" value={extendNote} onChange={(e) => setExtendNote(e.target.value)} rows={2} className="mt-1.5" maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExtending(null)}>{t("cancel")}</Button>
            <Button size="sm" onClick={submitExtend} disabled={extendingBusy} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
              {extendingBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
              {t("subManualExtend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminListings() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const [status, setStatus] = useState<string>("PENDING_REVIEW");
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebQ(q.trim()), 350);
    return () => clearTimeout(h);
  }, [q]);

  const url = `/api/admin/vehicles${qs({ status: status === "ALL" ? undefined : status, q: debQ || undefined })}`;
  const { data, loading, error, refetch } = useFetch<AdminVehicleRowDTO[]>(url);

  const patch = async (id: string, body: Record<string, string | boolean>) => {
    setBusyId(id);
    try {
      await apiSend(`/api/admin/vehicles/${id}`, "PATCH", body);
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const chips = ["ALL", ...VEHICLE_STATUSES];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center gap-2 sm:w-64">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("searchButton")}…`} className="h-9" aria-label={t("searchButton")} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => setStatus(c)}
              aria-pressed={status === c}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer min-h-[32px]",
                status === c ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {t(`vst${c}` as never)}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Car} text={t("noResults")} />
      ) : (
        <div className="space-y-2.5">
          {data.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <button
                onClick={() => navigate({ name: "detail", vehicleId: v.id })}
                className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 cursor-pointer"
                aria-label={`${v.make} ${v.model} ${v.year}`}
              >
                {v.images[0] ? (
                  <img src={v.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {v.make} {v.model} {v.variant ?? ""} {v.year}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {formatUsd(v.priceUsd)} · {v.sellerName} · {v.city}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <VehicleStatusBadge status={v.status} />
                  {v.featured && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => patch(v.id, { featured: !v.featured })}
                  disabled={busyId === v.id}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors cursor-pointer disabled:opacity-50",
                    v.featured ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-400 hover:text-amber-500"
                  )}
                  aria-label={v.featured ? t("actUnfeature") : t("actFeature")}
                >
                  <Star className={cn("h-4 w-4", v.featured && "fill-amber-400")} aria-hidden />
                </button>
                <Button variant="outline" size="sm" onClick={() => patch(v.id, { status: "PUBLISHED" })} disabled={busyId === v.id}
                  className="hidden border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:inline-flex">
                  {t("actApprove")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => patch(v.id, { status: "REJECTED" })} disabled={busyId === v.id}
                  className="hidden border-rose-200 text-rose-700 hover:bg-rose-50 sm:inline-flex">
                  {t("actReject")}
                </Button>
                {/* mobile compact actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="sm:hidden h-9 w-9" aria-label={t("actions")}>
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => patch(v.id, { status: "PUBLISHED" })}>{t("actApprove")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => patch(v.id, { status: "REJECTED" })} className="text-rose-600 focus:text-rose-700">{t("actReject")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- users ----------------

const USER_ROLES = ["BUYER", "SELLER", "DEALER", "ADMIN", "SUPER_ADMIN"] as const;

function AdminUsers() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<AdminUserDTO[]>("/api/admin/users");
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchRole = async (id: string, role: string) => {
    setBusyId(id);
    try {
      await apiSend(`/api/admin/users/${id}`, "PATCH", { role });
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
  }
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={Users} text={t("noResults")} />;

  return (
    <div className="space-y-2.5">
      {data.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <AvatarCircle name={u.name} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
              {u.name}
              {u.phoneVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={t("verVERIFIED")} />}
              <RoleBadge role={u.role} />
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              <span className="font-mono">{u.phone}</span> · {u.locale.toUpperCase()} · {t("kpiListings")} {u.listingCount} · {t("kpiFavorites")} {u.favoriteCount}
              {u.tenantName ? ` · ${u.tenantName}` : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busyId === u.id} aria-label={`${t("actChangeRole")} ${u.name}`}>
                {busyId === u.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("actChangeRole")}
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("actChangeRole")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {USER_ROLES.map((r) => (
                <DropdownMenuItem
                  key={r}
                  disabled={r === u.role}
                  onClick={() => patchRole(u.id, r)}
                  className={r === "SUPER_ADMIN" || r === "ADMIN" ? "text-amber-700 focus:text-amber-800" : undefined}
                >
                  {t(`role${r}` as never)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}

// ---------------- AI stats ----------------

const AI_STATUSES: { key: string; bar: string }[] = [
  { key: "VERIFIED", bar: "bg-emerald-500" },
  { key: "EVIDENCE_FOUND", bar: "bg-teal-500" },
  { key: "INCONSISTENT", bar: "bg-amber-500" },
  { key: "NOT_VERIFIED", bar: "bg-slate-400" },
  { key: "NO_DATA", bar: "bg-slate-300" },
];

function AdminAi() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<AiStatsDTO>("/api/admin/ai");

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const breakdownTotal = Object.values(data.statusBreakdown).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("kpiReports")}>
          <div className="flex items-center gap-5">
            <ConfidenceRing value={data.avgConfidence} size={88} />
            <div>
              <p className="text-3xl font-bold tracking-tight text-slate-900">{data.totalReports}</p>
              <p className="text-xs text-slate-500">{t("kpiReports")} · {t("confidence")} {data.avgConfidence}%</p>
              <p className="mt-1 text-[11px] text-slate-400">{t("reportsEmptyHint")}</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title={t("checks", { n: breakdownTotal })}>
          <div className="space-y-3">
            {AI_STATUSES.map((s) => (
              <HBar
                key={s.key}
                label={t(`legend${s.key}` as never)}
                value={data.statusBreakdown[s.key] ?? 0}
                total={breakdownTotal}
                colorClass={s.bar}
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("recentReports")}>
        {data.recent.length === 0 ? (
          <EmptyState icon={FileCheck2} text={t("reportsEmpty")} hint={t("reportsEmptyHint")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((r) => {
              // NOTE: AiStatsDTO.recent has no vehicleId field — `id` is used optimistically;
              // navigation is only offered when the id matches the platform's vehicle id format.
              const canOpen = r.id.startsWith("veh_");
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{r.vehicleLabel}</p>
                    <p className="text-[11px] text-slate-400">
                      {t("confidence")} {Math.round(r.confidence)}% · {timeAgo(r.createdAt, locale)}
                    </p>
                  </div>
                  {canOpen && (
                    <Button variant="outline" size="sm" onClick={() => navigate({ name: "report", vehicleId: r.id })}>
                      {t("actViewReport")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// ---------------- platform settings ----------------

function AdminSettings() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<PlatformSettingsDTO>("/api/admin/settings");
  const [form, setForm] = useState<PlatformSettingsDTO | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await apiSend<PlatformSettingsDTO>("/api/admin/settings", "PUT", {
        commissionPct: Number(form.commissionPct) || 0,
        featuredListingPriceUsd: Number(form.featuredListingPriceUsd) || 0,
        autoApproveListings: form.autoApproveListings,
        maintenanceMode: form.maintenanceMode,
      });
      setForm(saved);
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!form) return null;

  return (
    <div className="space-y-5">
      <SectionCard title={t("platformSettings")}>
      {form.maintenanceMode && (
        <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
          <TriangleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>{t("setMaintenance")}</AlertTitle>
          <AlertDescription>{t("maintenanceWarning")}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="adm-comm" className="text-xs text-slate-500">{t("setCommission")}</Label>
          <Input
            id="adm-comm" type="number" min={0} max={100} step={0.1} className="mt-1.5 h-9"
            value={form.commissionPct}
            onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="adm-feat" className="text-xs text-slate-500">{t("setFeaturedPrice")}</Label>
          <Input
            id="adm-feat" type="number" min={0} className="mt-1.5 h-9"
            value={form.featuredListingPriceUsd}
            onChange={(e) => setForm({ ...form, featuredListingPriceUsd: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label htmlFor="adm-auto" className="text-xs font-medium text-slate-600 cursor-pointer">{t("setAutoApprove")}</Label>
          <Switch id="adm-auto" checked={form.autoApproveListings} onCheckedChange={(v) => setForm({ ...form, autoApproveListings: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <Label htmlFor="adm-maint" className="text-xs font-medium text-slate-600 cursor-pointer">{t("setMaintenance")}</Label>
          <Switch id="adm-maint" checked={form.maintenanceMode} onCheckedChange={(v) => setForm({ ...form, maintenanceMode: v })} />
        </div>
      </div>
      <Button onClick={save} disabled={saving} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
        {t("saveChanges")}
      </Button>
    </SectionCard>

      <AdminPaymentConfig />
      <AdminPlanPricing />
    </div>
  );
}

// ---------------- audit log ----------------

function AdminAudit() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<AuditEntryDTO[]>("/api/admin/audit?limit=50");

  if (loading && !data) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={ScrollText} text={t("auditEmpty")} />;

  return (
    <SectionCard title={t("recentActivity")} contentClassName="">
      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto kl-scroll" aria-label={t("tabAudit")}>
        {data.map((a) => (
          <li key={a.id} className="px-0.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs">
                <code className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{a.action}</code>
                <span className="text-slate-600">{a.entity}</span>
                {a.actorName && <span className="text-slate-400"> · {a.actorName}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(a.createdAt, "en")}</span>
            </div>
            {a.meta && Object.keys(a.meta).length > 0 && (
              <p className="mt-1 truncate text-[10px] text-slate-400" title={JSON.stringify(a.meta)}>
                {JSON.stringify(a.meta).slice(0, 120)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------------- payments verification ----------------

const PAYMENT_FILTERS = ["AWAITING_VERIFICATION", "VERIFIED", "REJECTED", "CANCELLED", "ALL"] as const;

const PAYMENT_FILTER_LABEL: Record<(typeof PAYMENT_FILTERS)[number], string> = {
  AWAITING_VERIFICATION: "payStatusAwaiting",
  VERIFIED: "payStatusVerified",
  REJECTED: "payStatusRejected",
  CANCELLED: "payStatusCancelled",
  ALL: "anyCondition",
};

function AdminPayments() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const [status, setStatus] = useState<string>("AWAITING_VERIFICATION");
  const url = `/api/admin/payments${qs({ status: status === "ALL" ? undefined : status })}`;
  const { data, loading, error, refetch } = useFetch<SubscriptionPaymentDTO[]>(url);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SubscriptionPaymentDTO | null>(null);
  const [viewing, setViewing] = useState<SubscriptionPaymentDTO | null>(null);
  const [reason, setReason] = useState("");

  const decide = async (p: SubscriptionPaymentDTO, action: "verify" | "reject", reasonText?: string) => {
    setBusyId(p.id);
    try {
      await apiSend(`/api/admin/payments/${p.id}`, "PATCH", { action, reason: reasonText });
      toast.success(action === "verify" ? t("payVerifiedToast") : t("toastUpdated"));
      setRejecting(null);
      setReason("");
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PAYMENT_FILTERS.map((c) => (
          <button
            key={c}
            onClick={() => setStatus(c)}
            aria-pressed={status === c}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              status === c ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {t(PAYMENT_FILTER_LABEL[c] as never)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Wallet} text={t("noResults")} />
      ) : (
        <div className="space-y-3">
          {data.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {p.tenantName} · {p.plan} ({p.billingCycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")})
                    <PaymentStatusBadge status={p.status} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("payAmount")}: <span className="font-bold text-amber-700">{formatUsd(p.amountUsd)}</span>
                    {" · "}{t("payFromTenant")}: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{p.reference}</code>
                    {p.manualRef ? ` · ${t("payManualRef")}: ${p.manualRef}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {t("payMethodManual")}
                    {" · "}{timeAgo(p.createdAt, locale)}
                    {p.telegramSentAt ? ` · ${t("payTgSent")} ✓` : ""}
                    {p.telegramError && p.telegramError !== "not_configured" ? ` · ${t("payTgFailed")}` : ""}
                    {p.reviewedAt ? ` · ${t("payVerifier")}` : ""}
                  </p>
                  {p.note && <p className="mt-1 truncate text-xs italic text-slate-500">“{p.note}”</p>}
                  {p.rejectionReason && (
                    <p className="mt-1 text-xs text-rose-600">{t("payRejectedReason")}: {p.rejectionReason}</p>
                  )}
                  {p.evidenceUrl && (
                    <a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-teal-700 hover:underline">
                      {t("payEvidenceLabel")}
                    </a>
                  )}
                  {p.evidenceImage && (
                    <button
                      type="button"
                      onClick={() => setViewing(p)}
                      className="mt-2 flex cursor-pointer items-center gap-2"
                      aria-label={t("payEvidenceTitle")}
                    >
                      <img src={p.evidenceImage} alt={t("payEvidenceTitle")} className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                      <span className="text-[11px] font-medium text-slate-500 underline decoration-dotted">{t("payEvidenceTitle")}</span>
                    </button>
                  )}
                </div>
                {p.status === "AWAITING_VERIFICATION" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm" disabled={busyId === p.id} onClick={() => decide(p, "verify")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {busyId === p.id ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden />}
                      {t("payVerify")}
                    </Button>
                    <Button
                      variant="outline" size="sm" disabled={busyId === p.id}
                      onClick={() => { setRejecting(p); setReason(""); }}
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      {t("payReject")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Screenshot viewer */}
      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("payEvidenceTitle")}</DialogTitle>
          </DialogHeader>
          {viewing?.evidenceImage && (
            <div className="space-y-2">
              <img src={viewing.evidenceImage} alt={t("payEvidenceTitle")} className="max-h-[60vh] w-full rounded-lg border border-slate-200 object-contain" />
              <p className="text-center text-xs text-slate-500">
                {viewing.tenantName} · {formatUsd(viewing.amountUsd)} · <code>{viewing.reference}</code>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payRejectTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rejecting && (
              <p className="text-xs text-slate-500">
                {rejecting.tenantName} · {formatUsd(rejecting.amountUsd)} · <code>{rejecting.reference}</code>
              </p>
            )}
            <div>
              <Label htmlFor="rej-reason" className="text-xs text-slate-500">{t("payRejectReasonLabel")} *</Label>
              <Textarea id="rej-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1.5" maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>{t("cancel")}</Button>
            <Button
              size="sm" disabled={busyId !== null || reason.trim().length < 3}
              onClick={() => rejecting && decide(rejecting, "reject", reason.trim())}
              className="bg-rose-600 text-white hover:bg-rose-700 font-semibold"
            >
              {t("payReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- payment configuration (manual KHQR + Telegram bot) ----------------

interface ManualConfig {
  enabled: boolean;
  accountName: string | null;
  khqrPayload: string | null;
  khqrImageUrl: string | null;
  khqrImage: string | null;
  instructionsEn: string | null;
  instructionsKm: string | null;
  telegram: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  freePlan: { enabled: boolean; listingsLimit: number; featuredLimit: number; seats: number };
}

function AdminPaymentConfig() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, loading, error, refetch } = useFetch<ManualConfig>("/api/admin/payment-config");
  const preview = useFetch<{ dataUrl: string | null }>("/api/admin/payment-config/preview");
  const [form, setForm] = useState<ManualConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [readingQr, setReadingQr] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await apiSend("/api/admin/payment-config", "PUT", {
        enabled: form.enabled,
        accountName: form.accountName || null,
        khqrPayload: form.khqrPayload || null,
        khqrImageUrl: form.khqrImageUrl || null,
        khqrImage: form.khqrImage || null,
        instructionsEn: form.instructionsEn || null,
        instructionsKm: form.instructionsKm || null,
        telegram: form.telegram || null,
        telegramBotToken: form.telegramBotToken || null,
        telegramChatId: form.telegramChatId || null,
        freePlan: {
          enabled: form.freePlan.enabled,
          listingsLimit: Number(form.freePlan.listingsLimit) || 0,
          featuredLimit: Number(form.freePlan.featuredLimit) || 0,
          seats: Number(form.freePlan.seats) || 1,
        },
      });
      toast.success(t("payConfigSaved"));
      refetch();
      preview.refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const pickQrImage = async (file: File | undefined) => {
    if (!file) return;
    setReadingQr(true);
    try {
      const dataUrl = await fileToDataUrl(file, 720, 0.9);
      setForm((f) => (f ? { ...f, khqrImage: dataUrl } : f));
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setReadingQr(false);
      if (qrInput.current) qrInput.current.value = "";
    }
  };

  const testTelegram = async () => {
    setTestingTg(true);
    try {
      const res = await apiSend<{ ok: boolean; error: string | null }>(
        "/api/admin/payment-config/test-telegram", "POST",
      );
      if (res.ok) toast.success(t("payConfigTgTestOk"));
      else toast.error(t("payConfigTgTestFail", { err: res.error ?? "?" }));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setTestingTg(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!form) return null;

  return (
    <SectionCard title={t("payConfigTitle")}>
      <p className="-mt-2 mb-3 text-xs text-slate-400">{t("payConfigSubtitle")}</p>

      {/* master switch */}
      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <div className="min-w-0">
          <Label htmlFor="pc-enabled" className="text-sm font-semibold text-slate-900">{t("payConfigEnabled")}</Label>
          <p className="mt-0.5 text-xs text-slate-500">{t("payConfigEnabledDesc")}</p>
        </div>
        <Switch
          id="pc-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setForm({ ...form, enabled: v })}
          aria-label={t("payConfigEnabled")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pc-name" className="text-xs text-slate-500">{t("payConfigAccountName")}</Label>
          <Input id="pc-name" value={form.accountName ?? ""} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div>
          <Label htmlFor="pc-tg" className="text-xs text-slate-500">{t("payConfigTelegram")}</Label>
          <Input id="pc-tg" value={form.telegram ?? ""} onChange={(e) => setForm({ ...form, telegram: e.target.value })} placeholder="@khlan_admin" className="mt-1.5 h-9" />
        </div>

        {/* uploaded QR image — what sellers actually scan */}
        <div className="sm:col-span-2">
          <Label className="text-xs text-slate-500">{t("payConfigQrUpload")}</Label>
          <p className="mt-0.5 text-[11px] text-slate-400">{t("payConfigQrUploadHint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {form.khqrImage ? (
              <div className="flex items-center gap-3">
                <img src={form.khqrImage} alt={t("payConfigQrUpload")} className="h-28 w-28 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                    {t("payConfigQrUploaded")}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => qrInput.current?.click()}>
                    {t("payUploadChange")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-600 hover:bg-rose-50"
                    onClick={() => setForm({ ...form, khqrImage: null })}>
                    {t("payConfigQrRemove")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => qrInput.current?.click()}
                disabled={readingQr}
                className={cn(
                  "flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50/50",
                  readingQr && "opacity-60",
                )}
              >
                {readingQr ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4 text-slate-400" aria-hidden />}
                {t("payConfigQrUpload")}
              </button>
            )}
            {preview.data?.dataUrl && (
              <div className="flex items-center gap-2">
                <img src={preview.data.dataUrl} alt={t("payConfigPreview")} className="h-20 w-20 rounded-lg border border-slate-200 bg-white p-1" />
                <p className="max-w-[10rem] text-[10px] leading-tight text-slate-400">{t("payConfigPreview")}</p>
              </div>
            )}
          </div>
          <input
            ref={qrInput}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={t("payConfigQrUpload")}
            onChange={(e) => pickQrImage(e.target.files?.[0])}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="pc-payload" className="text-xs text-slate-500">{t("payConfigKhqrPayload")}</Label>
          <Textarea id="pc-payload" value={form.khqrPayload ?? ""} onChange={(e) => setForm({ ...form, khqrPayload: e.target.value })} rows={2} className="mt-1.5 font-mono text-xs field-sizing-fixed min-w-0" maxLength={600} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="pc-img" className="text-xs text-slate-500">{t("payConfigKhqrImage")}</Label>
          <Input id="pc-img" value={form.khqrImageUrl ?? ""} onChange={(e) => setForm({ ...form, khqrImageUrl: e.target.value })} placeholder="https://…" className="mt-1.5 h-9" />
        </div>

        {/* Telegram bot delivery */}
        <div className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Send className="h-4 w-4 text-sky-600" aria-hidden />
            {t("payConfigTgBotTitle")}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{t("payConfigTgBotDesc")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pc-tg-token" className="text-xs text-slate-500">{t("payConfigTgBotToken")}</Label>
              <Input id="pc-tg-token" type="password" value={form.telegramBotToken ?? ""}
                onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                placeholder="123456:ABC-DEF…" className="mt-1.5 h-9 font-mono text-xs" autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="pc-tg-chat" className="text-xs text-slate-500">{t("payConfigTgChatId")}</Label>
              <Input id="pc-tg-chat" value={form.telegramChatId ?? ""}
                onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                placeholder="123456789 or @channelname" className="mt-1.5 h-9 font-mono text-xs" />
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={testTelegram} disabled={testingTg}
            className="mt-3 border-sky-300 text-sky-800 hover:bg-sky-100">
            {testingTg ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <Send className="h-4 w-4 mr-1.5" aria-hidden />}
            {testingTg ? t("payConfigTgTesting") : t("payConfigTgTest")}
          </Button>
        </div>

        <div>
          <Label htmlFor="pc-inst-en" className="text-xs text-slate-500">{t("payConfigInstructionsEn")}</Label>
          <Textarea id="pc-inst-en" value={form.instructionsEn ?? ""} onChange={(e) => setForm({ ...form, instructionsEn: e.target.value })} rows={3} className="mt-1.5 field-sizing-fixed min-w-0" />
        </div>
        <div>
          <Label htmlFor="pc-inst-km" className="text-xs text-slate-500">{t("payConfigInstructionsKm")}</Label>
          <Textarea id="pc-inst-km" value={form.instructionsKm ?? ""} onChange={(e) => setForm({ ...form, instructionsKm: e.target.value })} rows={3} className={cn("mt-1.5 field-sizing-fixed min-w-0", locale === "km" && "font-khmer")} />
        </div>
      </div>

      {/* free plan configuration */}
      <div className="mt-5 rounded-xl border border-slate-200 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="pc-free-enabled" className="text-sm font-semibold text-slate-900">{t("payFreePlanTitle")}</Label>
            <p className="mt-0.5 text-xs text-slate-500">{t("payFreePlanDesc")}</p>
          </div>
          <Switch
            id="pc-free-enabled"
            checked={form.freePlan.enabled}
            onCheckedChange={(v) => setForm({ ...form, freePlan: { ...form.freePlan, enabled: v } })}
            aria-label={t("payFreePlanEnabled")}
          />
        </div>
        {form.freePlan.enabled && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="pc-free-listings" className="text-xs text-slate-500">{t("kpiListings")}</Label>
              <Input id="pc-free-listings" type="number" min={0} max={9999} value={form.freePlan.listingsLimit}
                onChange={(e) => setForm({ ...form, freePlan: { ...form.freePlan, listingsLimit: Number(e.target.value) } })}
                className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="pc-free-featured" className="text-xs text-slate-500">{t("actFeature")}</Label>
              <Input id="pc-free-featured" type="number" min={0} max={9999} value={form.freePlan.featuredLimit}
                onChange={(e) => setForm({ ...form, freePlan: { ...form.freePlan, featuredLimit: Number(e.target.value) } })}
                className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="pc-free-seats" className="text-xs text-slate-500">{t("subSeatsLabel")}</Label>
              <Input id="pc-free-seats" type="number" min={1} max={9999} value={form.freePlan.seats}
                onChange={(e) => setForm({ ...form, freePlan: { ...form.freePlan, seats: Number(e.target.value) } })}
                className="mt-1.5 h-9" />
            </div>
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
        {t("saveChanges")}
      </Button>
    </SectionCard>
  );
}

// ---------------- plans & pricing (admin-configured catalog) ----------------

function AdminPlanPricing() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<{ plans: PlanPricingConfig }>("/api/admin/plans");
  const [form, setForm] = useState<PlanPricingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data.plans);
  }, [data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await apiSend("/api/admin/plans", "PUT", form);
      toast.success(t("payPlansSaved"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!form) return null;

  const planKeys = Object.keys(form) as Array<keyof PlanPricingConfig>;

  const num = (plan: keyof PlanPricingConfig, field: keyof PlanPricingConfig["BASIC"], value: string) =>
    setForm({ ...form, [plan]: { ...form[plan], [field]: Number(value) || 0 } });

  return (
    <SectionCard title={t("payPlansTitle")}>
      <p className="-mt-2 mb-3 text-xs text-slate-400">{t("payPlansDesc")}</p>
      <div className="space-y-3">
        {planKeys.map((plan) => {
          const cfg = form[plan];
          return (
            <div key={plan} className={cn("rounded-xl border p-3", cfg.enabled ? "border-slate-200" : "border-slate-200 bg-slate-50/60 opacity-75")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{plan}</p>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`pl-${plan}-enabled`} className="text-[11px] font-medium text-slate-500">{t("payPlansEnabled")}</Label>
                  <Switch
                    id={`pl-${plan}-enabled`}
                    checked={cfg.enabled}
                    onCheckedChange={(v) => setForm({ ...form, [plan]: { ...cfg, enabled: v } })}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <Label htmlFor={`pl-${plan}-m`} className="text-xs text-slate-500">{t("payPlansMonthly")}</Label>
                  <Input id={`pl-${plan}-m`} type="number" min={0} step={1} value={cfg.priceUsdMonthly}
                    onChange={(e) => num(plan, "priceUsdMonthly", e.target.value)} className="mt-1.5 h-9" />
                </div>
                <div>
                  <Label htmlFor={`pl-${plan}-y`} className="text-xs text-slate-500">{t("payPlansYearly")}</Label>
                  <Input id={`pl-${plan}-y`} type="number" min={0} step={1} value={cfg.priceUsdYearly}
                    onChange={(e) => num(plan, "priceUsdYearly", e.target.value)} className="mt-1.5 h-9" />
                </div>
                <div>
                  <Label htmlFor={`pl-${plan}-l`} className="text-xs text-slate-500">{t("payPlansListings")}</Label>
                  <Input id={`pl-${plan}-l`} type="number" min={0} max={9999} value={cfg.listingsLimit}
                    onChange={(e) => num(plan, "listingsLimit", e.target.value)} className="mt-1.5 h-9" />
                </div>
                <div>
                  <Label htmlFor={`pl-${plan}-f`} className="text-xs text-slate-500">{t("payPlansFeatured")}</Label>
                  <Input id={`pl-${plan}-f`} type="number" min={0} max={9999} value={cfg.featuredLimit}
                    onChange={(e) => num(plan, "featuredLimit", e.target.value)} className="mt-1.5 h-9" />
                </div>
                <div>
                  <Label htmlFor={`pl-${plan}-s`} className="text-xs text-slate-500">{t("subSeatsLabel")}</Label>
                  <Input id={`pl-${plan}-s`} type="number" min={1} max={9999} value={cfg.seats}
                    onChange={(e) => num(plan, "seats", e.target.value)} className="mt-1.5 h-9" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={saving} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
        {t("saveChanges")}
      </Button>
    </SectionCard>
  );
}
