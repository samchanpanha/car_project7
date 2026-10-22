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
import { Pagination } from "@/components/marketplace/pagination";
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
  Star, Store, TriangleAlert, Upload, Users, Wallet, RefreshCw, Link2, Search, Check, CheckCircle2,
  Calendar, Clock, Copy, Repeat, Trash2,
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

const LISTINGS_PAGE_SIZE = 10;

function AdminListings() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const [status, setStatus] = useState<string>("PENDING_REVIEW");
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [page, setPage] = useState(1); // 1-based client-side pagination
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebQ(q.trim()), 350);
    return () => clearTimeout(h);
  }, [q]);

  // Any filter change restarts the list at page 1.
  useEffect(() => {
    setPage(1);
  }, [debQ, status]);

  const url = `/api/admin/vehicles${qs({ status: status === "ALL" ? undefined : status, q: debQ || undefined })}`;
  const { data, loading, error, refetch } = useFetch<AdminVehicleRowDTO[]>(url);

  // Page the moderation list client-side; refetches keep the current page.
  const totalRows = data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / LISTINGS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = (data ?? []).slice((currentPage - 1) * LISTINGS_PAGE_SIZE, currentPage * LISTINGS_PAGE_SIZE);

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
          {rows.map((v) => (
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

      {/* Pagination — paged over the moderation queue */}
      {data && data.length > LISTINGS_PAGE_SIZE && (
        <div className="space-y-1.5 pt-1">
          <p className="text-center text-xs text-slate-400">
            {t("paginationShowing", {
              from: (currentPage - 1) * LISTINGS_PAGE_SIZE + 1,
              to: Math.min(currentPage * LISTINGS_PAGE_SIZE, data.length),
              n: data.length,
            })}
          </p>
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} disabled={busyId !== null} />
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
        freeTrialEnabled: form.freeTrialEnabled ?? true,
        freeTrialDays: Math.max(0, Math.min(365, Math.round(Number(form.freeTrialDays) || 0))),
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

        {/* Free Trial Active / Inactive Status Section */}
        <div className="rounded-xl border border-slate-200 p-3.5 space-y-3 sm:col-span-2 bg-slate-50/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Label htmlFor="adm-trial-status" className="text-xs font-bold text-slate-800 cursor-pointer">
                  {t("setFreeTrialDays")}
                </Label>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold border",
                  form.freeTrialEnabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-rose-50 text-rose-700 border-rose-300"
                )}>
                  {form.freeTrialEnabled ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {form.freeTrialEnabled
                  ? "When ACTIVE: New sellers & dealers receive free trial access automatically upon registration."
                  : "When INACTIVE: New sellers & dealers MUST select a plan and complete payment before logging into their dashboard."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {form.freeTrialEnabled ? "Active" : "Inactive"}
              </span>
              <Switch
                id="adm-trial-status"
                checked={form.freeTrialEnabled}
                onCheckedChange={(v) => setForm({ ...form, freeTrialEnabled: v })}
              />
            </div>
          </div>

          {form.freeTrialEnabled && (
            <div className="pt-2.5 border-t border-slate-200/80">
              <Label htmlFor="adm-trial" className="text-xs text-slate-600 font-medium">
                Free Trial Duration (Days)
              </Label>
              <Input
                id="adm-trial" type="number" min={1} max={365} className="mt-1.5 h-9 bg-white"
                value={form.freeTrialDays}
                onChange={(e) => setForm({ ...form, freeTrialDays: Number(e.target.value) })}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t("setFreeTrialDaysHint")}</p>
            </div>
          )}
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
  const [subTab, setSubTab] = useState<"queue" | "aba">("queue");
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

  const sendToTelegram = async (paymentId: string) => {
    setBusyId(paymentId);
    try {
      await apiSend(`/api/admin/payments/${paymentId}`, "PATCH", { action: "send_telegram" });
      toast.success("Card with [Approve] and [Reject] buttons sent to Telegram group!");
      refetch();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher: Verification Queue vs ABA PayWay Synced Feed */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("queue")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer",
              subTab === "queue"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <Wallet className="h-4 w-4" />
            Verification Queue
          </button>
          <button
            type="button"
            onClick={() => setSubTab("aba")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer",
              subTab === "aba"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <Send className="h-4 w-4 text-sky-600" />
            ABA PayWay Synced Transactions
          </button>
        </div>
      </div>

      {subTab === "aba" ? (
        <AdminAbaTransactionsView onVerified={() => refetch()} />
      ) : (
        <>
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
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === p.id}
                          onClick={() => sendToTelegram(p.id)}
                          className="border-sky-300 bg-sky-50/50 text-sky-800 hover:bg-sky-100 text-xs font-semibold cursor-pointer"
                          title="Push to Telegram group with [Approve]/[Reject] buttons"
                        >
                          <Send className="h-3.5 w-3.5 mr-1 text-sky-600" />
                          Send to Telegram
                        </Button>
                        <Button
                          size="sm" disabled={busyId === p.id} onClick={() => decide(p, "verify")}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          {busyId === p.id ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden />}
                          {t("payVerify")}
                        </Button>
                        <Button
                          variant="outline" size="sm" disabled={busyId === p.id}
                          onClick={() => { setRejecting(p); setReason(""); }}
                          className="border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
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
        </>
      )}
    </div>
  );
}

// ---------------- ABA PayWay Telegram Synced Transactions View ----------------

interface AbaTxDTO {
  id: string;
  rawMessage: string;
  source: string;
  trxId: string;
  apv: string | null;
  amount: number;
  currency: "KHR" | "USD";
  amountUsd: number;
  payerName: string | null;
  payerAccount: string | null;
  bankCode: string | null;
  merchantName: string | null;
  transactionDateRaw: string | null;
  transactionDate: string;
  status: "UNMATCHED" | "MATCHED" | "MANUAL" | "AMBIGUOUS" | "UNDERPAID";
  isDuplicate?: boolean;
  duplicateCount?: number;
  sameTimeCollision?: boolean;
  collisionTrxIds?: string | null;
  verificationNote?: string | null;
  subscriptionPaymentId: string | null;
  subscriptionPayment?: {
    reference: string;
    plan: string;
    tenant?: { name: string; id: string };
  } | null;
  matchedAt: string | null;
  matchedBy: string | null;
  createdAt: string;
}

interface AbaDailyStatDTO {
  date: string;
  count: number;
  totalKhr: number;
  totalUsd: number;
  matchedCount: number;
  unmatchedCount: number;
  underpaidCount: number;
  duplicateCount: number;
  collisionCount: number;
}

interface AbaResponseDTO {
  transactions: AbaTxDTO[];
  dailyBreakdown: AbaDailyStatDTO[];
  summary: {
    totalCount: number;
    unmatchedCount: number;
    matchedCount: number;
    underpaidCount: number;
    duplicateCount: number;
    collisionCount: number;
    totalKhr: number;
    totalUsd: number;
  };
}

function AdminAbaTransactionsView({ onVerified }: { onVerified?: () => void }) {
  const [filter, setFilter] = useState<string>("ALL");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [syncing, setSyncing] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [matchingTx, setMatchingTx] = useState<AbaTxDTO | null>(null);
  const [matchingBusy, setMatchingBusy] = useState<boolean>(false);
  const [ingestOpen, setIngestOpen] = useState<boolean>(false);
  const [ingestText, setIngestText] = useState<string>("");
  const [ingesting, setIngesting] = useState<boolean>(false);

  const [clearing, setClearing] = useState<boolean>(false);

  const handleClearOldData = async () => {
    if (!confirm("Are you sure you want to remove all old ABA transaction test data from the database?")) return;
    setClearing(true);
    try {
      const res = await apiSend<{ success: boolean; deletedCount: number; message: string }>(
        "/api/admin/aba-transactions",
        "POST",
        { action: "clear" }
      );
      toast.success(res.message || "Old data removed successfully!");
      refetch();
      pendingPayments.refetch();
      onVerified?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setClearing(false);
    }
  };

  const handleIngest = async () => {
    if (!ingestText.trim()) return;
    setIngesting(true);
    try {
      const res = await apiSend<{
        success: boolean;
        transaction?: any;
        matched?: boolean;
        isDuplicate?: boolean;
        isSameTimeCollision?: boolean;
      }>("/api/admin/aba-transactions", "POST", {
        action: "ingest",
        rawMessage: ingestText.trim(),
      });
      if (res.isDuplicate) {
        toast.info("Transaction received as duplicate! Deduplication protection applied.");
      } else if (res.isSameTimeCollision) {
        toast.warning("Transaction saved with Same-Time Collision detected!");
      } else {
        toast.success("Transaction parsed and recorded successfully!");
      }
      setIngestText("");
      setIngestOpen(false);
      refetch();
      pendingPayments.refetch();
      onVerified?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setIngesting(false);
    }
  };

  const queryUrl = `/api/admin/aba-transactions${qs({
    status: ["ALL", "COLLISIONS", "DUPLICATES"].includes(filter) ? undefined : filter,
    duplicate: filter === "DUPLICATES" ? "true" : undefined,
    collision: filter === "COLLISIONS" ? "true" : undefined,
    day: selectedDay || undefined,
    search: search || undefined,
  })}`;

  const { data, loading, error, refetch } = useFetch<AbaResponseDTO>(queryUrl);
  const pendingPayments = useFetch<SubscriptionPaymentDTO[]>("/api/admin/payments?status=AWAITING_VERIFICATION");

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} to clipboard!`);
    } catch {
      toast.info(`${label}: ${text}`);
    }
  };

  // Auto-sync polling every 12 seconds while on this tab
  useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/admin/aba-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (
            (res?.outcome?.newTransactions ?? 0) > 0 ||
            (res?.outcome?.approvalsProcessed ?? 0) > 0 ||
            (res?.outcome?.rejectionsProcessed ?? 0) > 0
          ) {
            refetch();
            pendingPayments.refetch();
            onVerified?.();
          }
        })
        .catch(() => {});
    }, 12_000);
    return () => clearInterval(timer);
  }, []);

  const syncGroup = async () => {
    setSyncing(true);
    try {
      const res = await apiSend<{
        success: boolean;
        outcome: {
          processed: number;
          newTransactions: number;
          matchedPayments: number;
          duplicatesPrevented: number;
          sameTimeCollisions: number;
          approvalsProcessed?: number;
          rejectionsProcessed?: number;
          commandsProcessed?: number;
          errors?: string[];
        };
      }>("/api/admin/aba-transactions", "POST", { action: "sync" });

      const parts: string[] = [];
      if (res.outcome.newTransactions > 0) parts.push(`${res.outcome.newTransactions} new transaction(s)`);
      if (res.outcome.matchedPayments > 0) parts.push(`${res.outcome.matchedPayments} auto-matched`);
      if ((res.outcome.approvalsProcessed ?? 0) > 0) parts.push(`${res.outcome.approvalsProcessed} approved via Telegram`);
      if ((res.outcome.rejectionsProcessed ?? 0) > 0) parts.push(`${res.outcome.rejectionsProcessed} rejected via Telegram`);
      if (res.outcome.duplicatesPrevented > 0) parts.push(`${res.outcome.duplicatesPrevented} duplicate(s) blocked`);
      if (res.outcome.sameTimeCollisions > 0) parts.push(`${res.outcome.sameTimeCollisions} collision(s) flagged`);

      toast.success(
        parts.length > 0
          ? `Sync Complete: ${parts.join(", ")}!`
          : "Sync Complete: Checked Telegram group. All transactions and approval buttons are up-to-date!",
      );
      refetch();
      pendingPayments.refetch();
      onVerified?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSyncing(false);
    }
  };

  const verifyAudit = async () => {
    setVerifying(true);
    try {
      const res = await apiSend<{
        success: boolean;
        report: {
          totalTransactions: number;
          duplicateCount: number;
          sameTimeCollisionCount: number;
          ambiguousCount: number;
          autoMatchedCount: number;
        };
      }>("/api/admin/aba-transactions", "POST", {
        action: "verify",
        day: selectedDay || undefined,
      });

      toast.success(
        `Audit Complete: ${res.report.totalTransactions} transactions scanned. ${res.report.duplicateCount} duplicates verified, ${res.report.sameTimeCollisionCount} same-time collision(s) checked, ${res.report.autoMatchedCount} reconciled!`,
      );
      refetch();
      pendingPayments.refetch();
      onVerified?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setVerifying(false);
    }
  };

  const manualMatch = async (txId: string, paymentId: string) => {
    setMatchingBusy(true);
    try {
      await apiSend("/api/admin/aba-transactions", "PATCH", {
        transactionId: txId,
        subscriptionPaymentId: paymentId,
      });
      toast.success("Transaction matched and subscription activated!");
      setMatchingTx(null);
      refetch();
      pendingPayments.refetch();
      onVerified?.();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setMatchingBusy(false);
    }
  };

  const summary = data?.summary;
  const dailyBreakdown = data?.dailyBreakdown || [];

  return (
    <div className="space-y-4">
      {/* Header Info & Sync Actions */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Send className="h-4 w-4 text-sky-600" />
              Telegram Group Payment Syncer & Reconciler
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
              Captures all automated <span className="font-semibold text-slate-800">PayWay by ABA</span> alerts from Telegram group{" "}
              <code className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[11px] text-sky-900">-1004489863210</code> (MyABApayway) day-by-day.
              Automatically checks deduplication, verifies concurrent same-time transactions, and auto-activates subscriptions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearOldData}
              disabled={clearing || syncing || verifying}
              className="border-rose-300 bg-white text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer shadow-xs"
              title="Remove old test data and start fresh"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5 text-rose-500" />
              {clearing ? "Clearing..." : "Clear Old Data"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIngestOpen(true)}
              className="border-sky-300 bg-white text-sky-800 hover:bg-sky-100/70 text-xs font-semibold cursor-pointer shadow-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5 text-sky-600" />
              Paste ABA Alert
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={verifyAudit}
              disabled={verifying || syncing || clearing}
              className="border-sky-300 bg-white text-sky-800 hover:bg-sky-100/70 text-xs font-semibold cursor-pointer shadow-xs"
            >
              <ShieldCheck className={cn("h-3.5 w-3.5 mr-1.5 text-sky-600", verifying && "animate-spin")} />
              {verifying ? "Auditing..." : "Verify & Check All"}
            </Button>
            <Button
              size="sm"
              onClick={syncGroup}
              disabled={syncing || verifying || clearing}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer shadow-xs text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
              {syncing ? "Syncing Group..." : "Sync Group Now"}
            </Button>
          </div>
        </div>
        <div className="mt-2.5 rounded-lg border border-sky-200/90 bg-sky-100/70 p-2.5 text-xs text-sky-950 space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-sky-950">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Live Telegram Group Approvals & Commands:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed text-sky-900 pt-1">
            <div>
              <p>• <strong>1-Tap Mobile Approval:</strong> Click <code>[✅ Approve & Activate]</code> or <code>[❌ Reject]</code> on any card in the Telegram group. Subscription activates instantly and the message caption updates with your admin name & Phnom Penh timestamp.</p>
              <p className="mt-1">• <strong>Group Commands:</strong> Type <code>/pending</code> to list awaiting payments with buttons, or <code>/approve &lt;TrxID&gt;</code> to approve by text.</p>
            </div>
            <div>
              <p>• <strong>Automated ABA PayWay Alerts:</strong> Any ABA PayWay alert in group <code>-1004489863210</code> is automatically recorded, deduplicated, and matched.</p>
              <p className="mt-1">• <strong>Direct Bot Forwarding:</strong> You can also forward any ABA notification directly to <code>@KhmerSmartRestaurantBot</code> in a private chat to sync instantly.</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[11px] font-medium text-slate-400">Total Synced</p>
          <p className="mt-1 text-xl font-black text-slate-900">{summary?.totalCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[11px] font-medium text-slate-400">Total KHR (៛)</p>
          <p className="mt-1 text-xl font-black text-violet-700">៛{(summary?.totalKhr ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <p className="text-[11px] font-medium text-slate-400">Total USD ($)</p>
          <p className="mt-1 text-xl font-black text-emerald-700">${(summary?.totalUsd ?? 0).toFixed(2)}</p>
        </div>
        <div className={cn(
          "rounded-xl border p-3 shadow-xs transition-colors",
          (summary?.underpaidCount ?? 0) > 0 ? "border-amber-400 bg-amber-50/60" : "border-slate-200 bg-white"
        )}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-500">Underpaid (Pending)</p>
            {(summary?.underpaidCount ?? 0) > 0 && (
              <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
            )}
          </div>
          <p className={cn("mt-1 text-xl font-black", (summary?.underpaidCount ?? 0) > 0 ? "text-amber-800" : "text-slate-900")}>
            {summary?.underpaidCount ?? 0}
          </p>
        </div>
        <div className={cn(
          "rounded-xl border p-3 shadow-xs transition-colors",
          (summary?.collisionCount ?? 0) > 0 ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"
        )}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-500">Same-Time Conflicts</p>
            {(summary?.collisionCount ?? 0) > 0 && (
              <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
            )}
          </div>
          <p className={cn("mt-1 text-xl font-black", (summary?.collisionCount ?? 0) > 0 ? "text-amber-700" : "text-slate-900")}>
            {summary?.collisionCount ?? 0}
          </p>
        </div>
        <div className={cn(
          "rounded-xl border p-3 shadow-xs transition-colors",
          (summary?.duplicateCount ?? 0) > 0 ? "border-purple-200 bg-purple-50/40" : "border-slate-200 bg-white"
        )}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-500">Duplicates Blocked</p>
            {(summary?.duplicateCount ?? 0) > 0 && (
              <Repeat className="h-3.5 w-3.5 text-purple-600" />
            )}
          </div>
          <p className={cn("mt-1 text-xl font-black", (summary?.duplicateCount ?? 0) > 0 ? "text-purple-700" : "text-slate-900")}>
            {summary?.duplicateCount ?? 0}
          </p>
        </div>
      </div>

      {/* Day-by-Day Selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Calendar className="h-3.5 w-3.5 text-amber-600" />
            <span>Day-by-Day Sync & History (Phnom Penh UTC+7)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Custom Day:</span>
            <Input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="h-7 w-36 text-[11px]"
            />
            {selectedDay && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedDay("")}
                className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-800"
              >
                Clear Day
              </Button>
            )}
          </div>
        </div>

        {/* Day Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedDay("")}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1.5 font-medium transition-all cursor-pointer text-xs",
              selectedDay === ""
                ? "border-amber-500 bg-amber-500 text-white font-bold shadow-xs"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
            )}
          >
            All Days ({summary?.totalCount ?? 0})
          </button>

          {dailyBreakdown.map((day) => {
            const isSelected = selectedDay === day.date;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day.date)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 transition-all cursor-pointer text-xs text-left",
                  isSelected
                    ? "border-amber-600 bg-amber-50 border-2 font-bold text-amber-950 shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">{day.date}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                    {day.count}
                  </span>
                  {day.collisionCount > 0 && (
                    <span className="text-[10px] text-amber-600 font-bold" title={`${day.collisionCount} same-time collision(s)`}>
                      ⚠️{day.collisionCount}
                    </span>
                  )}
                  {day.duplicateCount > 0 && (
                    <span className="text-[10px] text-purple-600 font-bold" title={`${day.duplicateCount} duplicate(s)`}>
                      🔁
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {day.totalKhr > 0 && `៛${day.totalKhr.toLocaleString()}`}
                  {day.totalKhr > 0 && day.totalUsd > 0 && " · "}
                  {day.totalUsd > 0 && `$${day.totalUsd.toFixed(2)}`}
                </div>
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className="flex items-center justify-between rounded-lg bg-amber-50/70 border border-amber-200 px-3 py-1.5 text-xs text-amber-900">
            <span>
              Showing transactions for <strong>{selectedDay}</strong>
            </span>
            <button
              onClick={() => setSelectedDay("")}
              className="text-[11px] font-semibold underline text-amber-800 hover:text-amber-950 cursor-pointer"
            >
              Reset to all days
            </button>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: "All Transactions" },
            { id: "UNMATCHED", label: `Unmatched (${summary?.unmatchedCount ?? 0})` },
            { id: "UNDERPAID", label: `⚠️ Underpaid (${summary?.underpaidCount ?? 0})` },
            { id: "MATCHED", label: `Matched (${summary?.matchedCount ?? 0})` },
            { id: "COLLISIONS", label: `⚠️ Conflicts (${summary?.collisionCount ?? 0})` },
            { id: "DUPLICATES", label: `🔁 Duplicates (${summary?.duplicateCount ?? 0})` },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setFilter(st.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                filter === st.id
                  ? "border-amber-500 bg-amber-50 text-amber-900 font-bold"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {st.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Trx ID, APV, Payer..."
            className="h-8.5 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Transactions List */}
      {loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : !data || data.transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <Send className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No ABA transactions found</p>
          <p className="mt-1 text-xs text-slate-400">
            {selectedDay
              ? `No transactions recorded on ${selectedDay}. Try clearing the day filter or syncing the group.`
              : "When customers scan your KHQR and pay, automated messages from Telegram will appear here."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {selectedDay && (
              <Button size="sm" variant="outline" onClick={() => setSelectedDay("")} className="text-xs">
                View All Days
              </Button>
            )}
            <Button size="sm" onClick={syncGroup} className="bg-sky-600 text-white hover:bg-sky-700 text-xs">
              Sync Group Now
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.transactions.map((tx) => {
            const hasCollision = Boolean(tx.sameTimeCollision);
            const isDup = Boolean(tx.isDuplicate);
            const isMatched = tx.status === "MATCHED";
            const isAmbiguous = tx.status === "AMBIGUOUS";
            const isUnderpaid = tx.status === "UNDERPAID";

            return (
              <div
                key={tx.id}
                className={cn(
                  "rounded-xl border bg-white p-3.5 shadow-xs transition-all hover:border-slate-300 relative",
                  isMatched
                    ? "border-emerald-200 border-l-4 border-l-emerald-500"
                    : isUnderpaid
                    ? "border-amber-400 border-l-4 border-l-amber-600 bg-amber-50/20"
                    : isAmbiguous
                    ? "border-rose-300 border-l-4 border-l-rose-500 bg-rose-50/20"
                    : hasCollision
                    ? "border-amber-300 border-l-4 border-l-amber-500"
                    : isDup
                    ? "border-purple-200 border-l-4 border-l-purple-500"
                    : "border-slate-200",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Top Row: Amount & Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-black tracking-wide",
                          tx.currency === "KHR"
                            ? "bg-violet-100 text-violet-800"
                            : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {tx.currency === "KHR" ? `៛${tx.amount.toLocaleString()}` : `$${tx.amount.toFixed(2)}`}
                      </span>

                      {/* Trx ID with Copy */}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(tx.trxId, "Trx ID")}
                        className="inline-flex items-center gap-1 font-mono text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                        title="Click to copy Trx ID"
                      >
                        Trx: {tx.trxId}
                        <Copy className="h-3 w-3 text-slate-400" />
                      </button>

                      {/* APV with Copy */}
                      {tx.apv && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(tx.apv!, "APV Code")}
                          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                          title="Click to copy APV"
                        >
                          APV: {tx.apv}
                          <Copy className="h-2.5 w-2.5 text-slate-400" />
                        </button>
                      )}

                      {/* Status Badges */}
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <Check className="h-3 w-3" />
                          Matched: {tx.subscriptionPayment?.tenant?.name || "Dealer"} ({tx.subscriptionPayment?.reference})
                        </span>
                      ) : isUnderpaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                          <TriangleAlert className="h-3 w-3 text-amber-600" />
                          Underpaid / Pending Admin Check
                        </span>
                      ) : isAmbiguous ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[10px] font-bold text-rose-700">
                          <TriangleAlert className="h-3 w-3" />
                          Ambiguous (Manual Check Required)
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          Unmatched
                        </span>
                      )}

                      {/* Duplicate Indicator */}
                      {isDup && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          <Repeat className="h-3 w-3" />
                          Duplicate Received ({ (tx.duplicateCount || 0) + 1 }x)
                        </span>
                      )}

                      {/* Same-Time Collision Indicator */}
                      {hasCollision && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          <TriangleAlert className="h-3 w-3" />
                          Same-Time Conflict
                        </span>
                      )}
                    </div>

                    {/* Payer and Bank Info */}
                    <p className="text-xs text-slate-600">
                      Paid by <strong className="text-slate-900">{tx.payerName || "Customer"}</strong>
                      {tx.payerAccount ? ` (${tx.payerAccount})` : ""}
                      {" · "}
                      <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {tx.transactionDateRaw || new Date(tx.transactionDate).toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })}
                      </span>
                      {tx.bankCode ? ` · via ${tx.bankCode}` : ""}
                      {tx.merchantName ? ` · at ${tx.merchantName}` : ""}
                    </p>

                    {/* Underpaid Detailed Alert */}
                    {isUnderpaid && (
                      <div className="rounded-md border border-amber-300 bg-amber-50/90 p-2 text-xs text-amber-950 flex items-start gap-2">
                        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-semibold text-amber-950">
                            Partial / Underpayment Received
                          </p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Customer paid less than the subscription plan price. Kept in <strong>PENDING</strong> awaiting your review or confirmation.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Same-Time Collision Detailed Alert */}
                    {hasCollision && (
                      <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900 flex items-start gap-2">
                        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-semibold text-amber-950">
                            Concurrent Transaction Detected Around Same Time
                          </p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Occurred at the same time as Trx ID(s):{" "}
                            <strong className="font-mono">{tx.collisionTrxIds || "N/A"}</strong>.
                            {isAmbiguous
                              ? " Auto-activation paused to prevent cross-crediting wrong dealer. Please link manually below."
                              : " Deduplication and reference safeguards applied."}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Duplicate Detailed Alert */}
                    {isDup && (
                      <div className="rounded-md border border-purple-200 bg-purple-50/70 p-2 text-xs text-purple-900 flex items-start gap-2">
                        <Repeat className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
                        <div>
                          <p className="font-semibold text-purple-950">
                            Deduplicated: Telegram Notification Received { (tx.duplicateCount || 0) + 1 } Times
                          </p>
                          <p className="text-[11px] text-purple-800 mt-0.5">
                            The same payment notification was posted repeatedly in the group. Deduplication engine prevented duplicate balance or repeated subscription activation.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Verification Note */}
                    {tx.verificationNote && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 rounded px-2 py-1 border border-slate-100">
                        {tx.verificationNote}
                      </p>
                    )}

                    {/* Raw Message Snippet */}
                    <p className="truncate font-mono text-[10px] text-slate-400 bg-slate-50 rounded px-2 py-1 select-all">
                      {tx.rawMessage}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {!isMatched && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMatchingTx(tx)}
                        className={cn(
                          "text-xs font-semibold cursor-pointer shadow-xs",
                          isUnderpaid
                            ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                            : isAmbiguous
                            ? "border-rose-400 bg-rose-50 text-rose-900 hover:bg-rose-100"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />
                        {isUnderpaid ? "Review & Match" : isAmbiguous ? "Resolve Conflict" : "Match Payment"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Match Dialog */}
      <Dialog open={Boolean(matchingTx)} onOpenChange={(o) => !o && setMatchingTx(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-amber-600" />
              Match ABA Transaction with Dealer Payment
            </DialogTitle>
          </DialogHeader>

          {matchingTx && (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {matchingTx.currency === "KHR" ? `៛${matchingTx.amount.toLocaleString()}` : `$${matchingTx.amount.toFixed(2)}`}
                  </span>
                  <span className="font-mono text-slate-600 font-bold">Trx: {matchingTx.trxId}</span>
                </div>
                <p className="text-slate-500">
                  Payer: <strong>{matchingTx.payerName || "Customer"}</strong> ({matchingTx.payerAccount || "No Mask"})
                </p>
                <p className="text-slate-400 text-[11px]">
                  Time: {matchingTx.transactionDateRaw || new Date(matchingTx.transactionDate).toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })}
                </p>
                {matchingTx.sameTimeCollision && (
                  <p className="text-[11px] text-amber-700 font-semibold">
                    ⚠️ Concurrent transaction detected with Trx ID(s): {matchingTx.collisionTrxIds}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Select Pending Payment Request</Label>
                {pendingPayments.loading ? (
                  <Skeleton className="h-16 w-full mt-2" />
                ) : !pendingPayments.data || pendingPayments.data.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center mt-2">
                    <p className="text-xs text-slate-500 font-medium">No pending payments awaiting verification</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      When dealers submit subscription requests, they will appear here for matching.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {pendingPayments.data.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={matchingBusy}
                        onClick={() => manualMatch(matchingTx.id, p.id)}
                        className="w-full text-left p-2.5 hover:bg-amber-50/70 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-slate-900">{p.tenantName}</span>
                          <span className="font-bold text-xs text-amber-700">${p.amountUsd.toFixed(2)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {p.plan} ({p.billingCycle}) · Ref: <code>{p.reference}</code>
                          {p.manualRef ? ` · Bank Ref: ${p.manualRef}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMatchingTx(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Paste/Ingest Dialog */}
      <Dialog open={ingestOpen} onOpenChange={setIngestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-sky-600" />
              Paste ABA PayWay / KHQR Alert
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Paste the Telegram notification text from ABA Bank / Bakong to parse, check for duplicates, and auto-match:
            </p>
            <Textarea
              rows={4}
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="PayWay by ABA: ៛200 paid by Sam Chanpanha (*674) on Oct 22, 01:05 PM via ABA KHQR (AMRTKHPPXXX) at SAM CHAN PANHA. Trx. ID: 179264913984347, APV: 135160."
              className="text-xs font-mono"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIngestOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleIngest}
              disabled={ingesting || !ingestText.trim()}
              className="bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs"
            >
              {ingesting ? "Processing..." : "Verify & Save"}
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
  khqrImageMonthly?: string | null;
  khqrImageYearly?: string | null;
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
  const [readingMonthly, setReadingMonthly] = useState(false);
  const [readingYearly, setReadingYearly] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);
  const qrInputMonthly = useRef<HTMLInputElement>(null);
  const qrInputYearly = useRef<HTMLInputElement>(null);

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
        khqrImageMonthly: form.khqrImageMonthly || null,
        khqrImageYearly: form.khqrImageYearly || null,
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

  const pickQrMonthly = async (file: File | undefined) => {
    if (!file) return;
    setReadingMonthly(true);
    try {
      const dataUrl = await fileToDataUrl(file, 720, 0.9);
      setForm((f) => (f ? { ...f, khqrImageMonthly: dataUrl } : f));
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setReadingMonthly(false);
      if (qrInputMonthly.current) qrInputMonthly.current.value = "";
    }
  };

  const pickQrYearly = async (file: File | undefined) => {
    if (!file) return;
    setReadingYearly(true);
    try {
      const dataUrl = await fileToDataUrl(file, 720, 0.9);
      setForm((f) => (f ? { ...f, khqrImageYearly: dataUrl } : f));
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setReadingYearly(false);
      if (qrInputYearly.current) qrInputYearly.current.value = "";
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

        {/* Per-plan KHQR image uploads (Monthly & Yearly) */}
        <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div>
            <Label className="text-xs font-semibold text-slate-800">KHQR Payment Images by Billing Cycle</Label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Upload custom QR codes for 1-Month and 1-Year plans. Sellers will see the matching QR code when selecting each plan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Monthly QR */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">1-Month Plan KHQR</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Monthly</span>
              </div>
              {form.khqrImageMonthly ? (
                <div className="flex items-center gap-3">
                  <img src={form.khqrImageMonthly} alt="Monthly KHQR" className="h-24 w-24 rounded-lg border border-slate-200 object-contain p-1" />
                  <div className="flex flex-col gap-1.5">
                    <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                      Uploaded
                    </p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => qrInputMonthly.current?.click()}>
                      {t("payUploadChange")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-600 hover:bg-rose-50"
                      onClick={() => setForm({ ...form, khqrImageMonthly: null })}>
                      {t("payConfigQrRemove")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => qrInputMonthly.current?.click()}
                  disabled={readingMonthly}
                  className={cn(
                    "flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50/50",
                    readingMonthly && "opacity-60",
                  )}
                >
                  {readingMonthly ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4 text-slate-400" aria-hidden />}
                  Upload 1-Month KHQR
                </button>
              )}
            </div>

            {/* Yearly QR */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">1-Year Plan KHQR</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">Yearly (12 Mo)</span>
              </div>
              {form.khqrImageYearly ? (
                <div className="flex items-center gap-3">
                  <img src={form.khqrImageYearly} alt="Yearly KHQR" className="h-24 w-24 rounded-lg border border-slate-200 object-contain p-1" />
                  <div className="flex flex-col gap-1.5">
                    <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                      Uploaded
                    </p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => qrInputYearly.current?.click()}>
                      {t("payUploadChange")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-600 hover:bg-rose-50"
                      onClick={() => setForm({ ...form, khqrImageYearly: null })}>
                      {t("payConfigQrRemove")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => qrInputYearly.current?.click()}
                  disabled={readingYearly}
                  className={cn(
                    "flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50/50",
                    readingYearly && "opacity-60",
                  )}
                >
                  {readingYearly ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4 text-slate-400" aria-hidden />}
                  Upload 1-Year KHQR
                </button>
              )}
            </div>
          </div>

          {/* Hidden inputs */}
          <input
            ref={qrInputMonthly}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload Monthly KHQR"
            onChange={(e) => pickQrMonthly(e.target.files?.[0])}
          />
          <input
            ref={qrInputYearly}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload Yearly KHQR"
            onChange={(e) => pickQrYearly(e.target.files?.[0])}
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
