"use client";

// Dealer (tenant) dashboard — inventory, leads, appointments, staff, subscription, profile.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend, qs } from "@/lib/client-hooks";
import { formatUsd, timeAgo } from "@/lib/format";
import type {
  SessionDTO, TenantDashboardDTO, TenantVehicleRowDTO, TenantLeadDTO, TenantAppointmentDTO,
  TenantMemberDTO, PlanDTO, SubscriptionDTO,
} from "@/lib/dashboard-types";
import type { VehicleStatus } from "@/lib/types";
import { DashboardShell, type DashboardTabDef } from "./shell";
import { RequestSubscriptionDialog, TenantPaymentHistory, PendingPaymentBanner, SubscriptionPaywallCard } from "./payment-flow";
import { PurchaseRequestList } from "./purchase-list";
import { ListingEditorDialog } from "@/components/marketplace/listing-editor";
import { Pagination } from "@/components/marketplace/pagination";
import {
  AppointmentStatusBadge, AvatarCircle, EmptyState, FetchErrorState, SectionCard, StatCard,
  StatCardSkeleton, TenantRoleBadge, VerificationBadge, VehicleStatusBadge, errorText,
  formatDateTime, isForbidden, isFeaturedLimit,
} from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays, Car, ChevronDown, CreditCard, Eye, Heart, Hourglass, LayoutDashboard, Loader2,
  MessageSquare, MoreHorizontal, Plus, Settings, Star, Store, TriangleAlert, UserPlus, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TENANT_STATUSES: (VehicleStatus | "ALL")[] = ["ALL", "PUBLISHED", "PENDING_REVIEW", "DRAFT", "SOLD", "ARCHIVED"];
const STAFF_ROLES = ["MANAGER", "SALES_STAFF", "INVENTORY_MANAGER"] as const;

export function DealerDashboard({ me }: { me: SessionDTO }) {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const active = (view.name === "dashboard" && view.tab) || "overview";
  const setTab = (tab: string) => navigate({ name: "dashboard", tab });

  const tabs: DashboardTabDef[] = [
    { id: "overview", label: t("tabOverview"), icon: LayoutDashboard },
    { id: "inventory", label: t("tabInventory"), icon: Car },
    { id: "leads", label: t("tabLeads"), icon: MessageSquare },
    { id: "appointments", label: t("tabAppointments"), icon: CalendarDays },
    { id: "staff", label: t("tabStaff"), icon: Users },
    { id: "subscription", label: t("tabSubscription"), icon: CreditCard },
    { id: "settings", label: t("tabSettings"), icon: Settings },
  ];

  return (
    <DashboardShell
      greeting={t("dashboardWelcome", { name: me.user.name })}
      subtitle={t("dashboardDealerSub")}
      badge={
        <span className="flex items-center gap-1.5">
          <TenantRoleBadge role={me.tenant?.myRole ?? "OWNER"} />
          {me.tenant && <span className="text-xs font-medium text-slate-500">{me.tenant.name}</span>}
        </span>
      }
      tabs={tabs}
      active={active}
      onTab={setTab}
    >
      {(!me.subscription || me.subscription.status !== "ACTIVE") && (
        <SubscriptionPaywallCard
          role="DEALER"
          onActivated={() => {
            window.location.reload();
          }}
        />
      )}
      {active === "overview" && <DealerOverview />}
      {active === "inventory" && (
        !me.subscription || me.subscription.status !== "ACTIVE" ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-bold">Dealership Inventory Locked</p>
            <p className="mt-1">Please complete your subscription payment above to add and manage dealership cars.</p>
          </div>
        ) : (
          <DealerInventory />
        )
      )}
      {active === "leads" && (
        !me.subscription || me.subscription.status !== "ACTIVE" ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-bold">Customer Leads Locked</p>
            <p className="mt-1">Please complete your subscription payment above to access buyer inquiries and leads.</p>
          </div>
        ) : (
          <DealerLeads />
        )
      )}
      {active === "appointments" && <DealerAppointments />}
      {active === "staff" && <DealerStaff />}
      {active === "subscription" && <DealerSubscription />}
      {active === "settings" && <DealerSettings />}
    </DashboardShell>
  );
}

// ---------------- overview ----------------

function DealerOverview() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const meDash = useFetch<TenantDashboardDTO>("/api/tenant/me");
  const leads = useFetch<TenantLeadDTO[]>("/api/tenant/leads");
  const inv = useFetch<TenantVehicleRowDTO[]>("/api/tenant/inventory");
  const featuredUsed = (inv.data ?? []).filter((v) => v.featured).length;

  if (meDash.loading && !meDash.data) {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </>
    );
  }
  if (meDash.error && !meDash.data) return <FetchErrorState message={meDash.error} onRetry={meDash.refetch} />;
  const dash = meDash.data;
  if (!dash) return null;

  const sub = dash.subscription;
  const used = dash.stats.published + dash.stats.pending + dash.stats.sold + dash.stats.draft;
  const ver = dash.tenant.verification;

  return (
    <>
      {(ver === "PENDING" || ver === "UNVERIFIED") && (
        <Alert className={cn(ver === "PENDING" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-100 text-slate-700")}>
          <Hourglass className="h-4 w-4" aria-hidden />
          <AlertTitle>{ver === "PENDING" ? t("verAlertPendingTitle") : t("verAlertUnverifiedTitle")}</AlertTitle>
          <AlertDescription>{ver === "PENDING" ? t("verAlertPendingBody") : t("verAlertUnverifiedBody")}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Car} label={t("vstPUBLISHED")} value={dash.stats.published} />
        <StatCard icon={Hourglass} label={t("vstPENDING_REVIEW")} value={dash.stats.pending} />
        <StatCard icon={Eye} label={t("kpiViews")} value={dash.stats.totalViews} />
        <StatCard icon={MessageSquare} label={t("kpiLeads")} value={dash.stats.totalLeads} />
        <StatCard icon={Heart} label={t("kpiFavorites")} value={dash.stats.activeFavorites} />
        <StatCard icon={CalendarDays} label={t("kpiAppointments")} value={dash.stats.appointmentsRequested} />
      </div>

      <SectionCard
        title={t("subCurrentPlan")}
        action={sub ? <span className="text-xs text-slate-400">{timeAgo(sub.startedAt, locale)}</span> : undefined}
      >
        {!sub ? (
          <p className="text-sm text-slate-500">{t("subNoPlan")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">{sub.plan}</span>
              <span className="text-xs text-slate-500">{formatUsd(sub.priceUsd)} / {sub.billingCycle === "MONTHLY" ? t("billingMonthly").toLowerCase() : t("billingYearly").toLowerCase()}</span>
              <span className="text-xs text-slate-400">· {t("subRenews", { d: formatDateTime(sub.currentPeriodEnd, locale) })}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{t("subListingsUsage", { used, limit: sub.listingsLimit })}</span>
                <span className="tabular-nums">{Math.min(100, Math.round((used / Math.max(1, sub.listingsLimit)) * 100))}%</span>
              </div>
              <Progress value={(used / Math.max(1, sub.listingsLimit)) * 100} className="h-2" aria-label={t("subListingsUsage", { used, limit: sub.listingsLimit })} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{t("subFeaturedUsage", { used: featuredUsed, limit: sub.featuredLimit })}</span>
              </div>
              <Progress value={Math.min(100, (featuredUsed / Math.max(1, sub.featuredLimit)) * 100)} className="h-2" aria-label={t("subFeaturedUsage", { used: featuredUsed, limit: sub.featuredLimit })} />
            </div>
            <p className="text-xs text-slate-500">{t("subSeats", { n: sub.seats })}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("recentLeads")}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: "dashboard", tab: "leads" })} className="text-xs text-amber-700 hover:text-amber-800">
            {t("viewAllLeads")}
          </Button>
        }
      >
        {leads.loading && !leads.data ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : !leads.data || leads.data.length === 0 ? (
          <EmptyState icon={MessageSquare} text={t("leadsEmpty")} hint={t("leadsEmptyHint")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {leads.data.slice(0, 3).map((l) => (
              <li key={l.conversationId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {l.buyer.name} · {l.vehicle.make} {l.vehicle.model} {l.vehicle.year}
                  </p>
                  {l.lastMessage && <p className="truncate text-xs text-slate-500">{l.lastMessage.body}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate({ name: "messages", conversationId: l.conversationId })}>
                  {t("actOpenChat")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// ---------------- inventory ----------------

const INVENTORY_PAGE_SIZE = 8;

function DealerInventory() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1); // 1-based client-side pagination
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TenantVehicleRowDTO | null>(null);
  const [editPrice, setEditPrice] = useState("");
  // Full stock editor (all info + unlimited image management) — Task 16.
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const url = `/api/tenant/inventory${qs({ status: status === "ALL" ? undefined : status })}`;
  const { data, loading, error, refetch } = useFetch<TenantVehicleRowDTO[]>(url);

  // Page the full stock list client-side; refetches keep the current page.
  const totalRows = data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / INVENTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = (data ?? []).slice((currentPage - 1) * INVENTORY_PAGE_SIZE, currentPage * INVENTORY_PAGE_SIZE);

  const patch = async (id: string, body: Record<string, string | number | boolean>) => {
    setBusyId(id);
    try {
      await apiSend(`/api/tenant/inventory/${id}`, "PATCH", body);
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : isFeaturedLimit(e) ? t("toastFeaturedLimit") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const submitPrice = async () => {
    if (!editing) return;
    const p = Number(editPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    await patch(editing.id, { priceUsd: p });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TENANT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              aria-pressed={status === s}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                status === s ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {t(`vst${s}` as never)}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => navigate({ name: "sell" })} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          {t("addListing")}
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Car} text={t("inventoryEmpty")} />
      ) : (
        <div className="space-y-2.5">
          {rows.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {v.images[0] ? (
                  <img src={v.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {v.make} {v.model} {v.variant ?? ""} {v.year}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {formatUsd(v.priceUsd)} · <Eye className="inline h-3 w-3" aria-hidden /> {v.views}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <VehicleStatusBadge status={v.status} />
                  {v.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label={t("actFeature")} />}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" disabled={busyId === v.id} aria-label={`${t("actions")} ${v.make} ${v.model}`}>
                    {busyId === v.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setEditorId(v.id); setEditorOpen(true); }}>
                    {t("actEditListing")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patch(v.id, { status: "PUBLISHED" })}>{t("actPublish")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patch(v.id, { status: "DRAFT" })}>{t("actUnpublish")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patch(v.id, { status: "SOLD" })}>{t("actMarkSold")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patch(v.id, { status: "ARCHIVED" })}>{t("actArchive")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => patch(v.id, { featured: !v.featured })}>
                    {v.featured ? t("actUnfeature") : t("actFeature")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setEditing(v); setEditPrice(String(v.priceUsd)); }}>
                    {t("actEditPrice")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Pagination — paged over the full stock list */}
      {data && data.length > INVENTORY_PAGE_SIZE && (
        <div className="space-y-1.5 pt-1">
          <p className="text-center text-xs text-slate-400">
            {t("paginationShowing", {
              from: (currentPage - 1) * INVENTORY_PAGE_SIZE + 1,
              to: Math.min(currentPage * INVENTORY_PAGE_SIZE, data.length),
              n: data.length,
            })}
          </p>
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} disabled={busyId !== null} />
        </div>
      )}

      {/* Edit price dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("editPriceTitle")}</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="inv-price" className="text-xs text-slate-500">{editing ? `${editing.make} ${editing.model} ${editing.year}` : ""}</Label>
            <Input
              id="inv-price" type="number" min={0} className="mt-1.5 h-9" value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)} autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            <Button size="sm" onClick={submitPrice} disabled={busyId !== null} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full stock editor — all listing info + unlimited photo manager */}
      <ListingEditorDialog
        vehicleId={editorId}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) refetch();
        }}
      />
    </div>
  );
}

// ---------------- leads ----------------

function DealerLeads() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<TenantLeadDTO[]>("/api/tenant/leads");

  return (
    <div className="space-y-5">
      <PurchaseRequestList url="/api/tenant/purchase-requests" mode="seller" />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("recentLeads")}</h2>
        {loading && !data ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        : error && !data ? <FetchErrorState message={error} onRetry={refetch} />
        : !data || data.length === 0 ? <EmptyState icon={MessageSquare} text={t("leadsEmpty")} hint={t("leadsEmptyHint")} />
        : (
        <div className="space-y-3">
          {data.map((l) => (
            <div key={l.conversationId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {l.vehicle.thumbnail ? (
                      <img src={l.vehicle.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Car className="mx-auto h-5 w-5 text-slate-300" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{l.buyer.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {l.vehicle.make} {l.vehicle.model} {l.vehicle.year} · {formatUsd(l.vehicle.priceUsd)}
                    </p>
                    {l.lastMessage && (
                      <p className="mt-1.5 truncate rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        <span className="text-[10px] font-semibold text-slate-400">{l.lastMessage.isMine ? "↗" : "↙"} </span>
                        {l.lastMessage.body}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[10px] text-slate-400">{timeAgo(l.updatedAt, locale)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{l.messageCount}</span>
                  <Button variant="outline" size="sm" onClick={() => navigate({ name: "messages", conversationId: l.conversationId })}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" aria-hidden />
                    {t("actOpenChat")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

// ---------------- appointments ----------------

function DealerAppointments() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, loading, error, refetch } = useFetch<TenantAppointmentDTO[]>("/api/tenant/appointments");
  const [busyId, setBusyId] = useState<string | null>(null);

  const patch = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await apiSend(`/api/tenant/appointments/${id}`, "PATCH", { status });
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={CalendarDays} text={t("apptEmpty")} hint={t("apptEmptyHint")} />;

  return (
    <div className="space-y-2.5">
      {data.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {a.buyer.name} · {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(a.scheduledAt, locale)}</p>
            {a.notes && <p className="mt-1 truncate text-xs italic text-slate-400">“{a.notes}”</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={a.status} />
            {a.status === "REQUESTED" && (
              <Button variant="outline" size="sm" disabled={busyId === a.id} onClick={() => patch(a.id, "CONFIRMED")} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                {t("actConfirmAppt")}
              </Button>
            )}
            {a.status === "CONFIRMED" && (
              <Button variant="outline" size="sm" disabled={busyId === a.id} onClick={() => patch(a.id, "COMPLETED")} className="border-teal-200 text-teal-700 hover:bg-teal-50">
                {t("actCompleteAppt")}
              </Button>
            )}
            {(a.status === "REQUESTED" || a.status === "CONFIRMED") && (
              <Button variant="ghost" size="sm" disabled={busyId === a.id} onClick={() => patch(a.id, "CANCELLED")} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                {t("actCancelAppt")}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- staff ----------------

function DealerStaff() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<TenantMemberDTO[]>("/api/tenant/staff");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invPhone, setInvPhone] = useState("");
  const [invRole, setInvRole] = useState<(typeof STAFF_ROLES)[number]>("SALES_STAFF");
  const [inviting, setInviting] = useState(false);

  const patch = async (memberId: string, body: Record<string, string>) => {
    setBusyId(memberId);
    try {
      await apiSend(`/api/tenant/staff/${memberId}`, "PATCH", body);
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const invite = async () => {
    if (!invName.trim() || !invPhone.trim()) return;
    setInviting(true);
    try {
      await apiSend("/api/tenant/staff", "POST", { name: invName.trim(), phone: invPhone.trim(), role: invRole });
      toast.success(t("toastUpdated"));
      setInviteOpen(false);
      setInvName("");
      setInvPhone("");
      setInvRole("SALES_STAFF");
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setInviteOpen(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
          <UserPlus className="h-4 w-4 mr-1.5" aria-hidden />
          {t("actInviteMember")}
        </Button>
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Users} text={t("staffEmpty")} />
      ) : (
        <div className="space-y-2.5">
          {data.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <AvatarCircle name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900">
                  {m.name}
                  <TenantRoleBadge role={m.role} />
                  {m.status === "SUSPENDED" && (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">{t("tstSUSPENDED")}</span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400"><span className="font-mono">{m.phone}</span></p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={busyId === m.id} aria-label={`${t("actChangeRole")} ${m.name}`}>
                      {busyId === m.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("actChangeRole")}
                      <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t("inviteRole")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {STAFF_ROLES.map((r) => (
                      <DropdownMenuItem key={r} disabled={r === m.role} onClick={() => patch(m.id, { role: r })}>
                        {t(`trole${r}` as never)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost" size="sm"
                  disabled={busyId === m.id}
                  onClick={() => patch(m.id, { status: m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}
                  className={m.status === "ACTIVE" ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700" : "text-emerald-700 hover:bg-emerald-50"}
                >
                  {m.status === "ACTIVE" ? t("actSuspend") : t("actActivate")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("actInviteMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="inv-name" className="text-xs text-slate-500">{t("inviteName")}</Label>
              <Input id="inv-name" value={invName} onChange={(e) => setInvName(e.target.value)} className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="inv-phone" className="text-xs text-slate-500">{t("invitePhone")}</Label>
              <Input id="inv-phone" type="tel" placeholder="+855 12 345 678" value={invPhone} onChange={(e) => setInvPhone(e.target.value)} className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="inv-role" className="text-xs text-slate-500">{t("inviteRole")}</Label>
              <select
                id="inv-role"
                value={invRole}
                onChange={(e) => setInvRole(e.target.value as (typeof STAFF_ROLES)[number])}
                className="mt-1.5 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{t(`trole${r}` as never)}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>{t("cancel")}</Button>
            <Button size="sm" onClick={invite} disabled={inviting || !invName.trim() || !invPhone.trim()} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
              {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
              {t("actInviteMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- subscription ----------------

function DealerSubscription() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, loading, error, refetch } = useFetch<{
    subscription: SubscriptionDTO | null;
    plans: PlanDTO[];
    freePlanEnabled?: boolean;
    paymentsEnabled?: boolean;
  }>("/api/tenant/subscription");
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [requesting, setRequesting] = useState<PlanDTO | null>(null);
  const [downgrading, setDowngrading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (data?.subscription) setCycle(data.subscription.billingCycle);
  }, [data?.subscription?.billingCycle]);

  const downgrade = async () => {
    setDowngrading(true);
    try {
      await apiSend("/api/tenant/subscription", "POST", { plan: "FREE" });
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setDowngrading(false);
    }
  };

  if (loading && !data) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  const plans = data?.plans ?? [];
  const current = data?.subscription ?? null;
  const expired = current?.status === "EXPIRED";
  const freeDisabled = data?.freePlanEnabled === false;
  const paymentsDisabled = data?.paymentsEnabled === false;

  return (
    <div className="space-y-4">
      {paymentsDisabled && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertDescription className="text-xs font-medium text-amber-900">{t("payDisabledNotice")}</AlertDescription>
        </Alert>
      )}

      {/* submitted payments waiting for the Super Admin's manual approval */}
      <PendingPaymentBanner />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{t("subCurrentPlan")}</p>
        <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label={t("tabSubscription")}>
          {(["MONTHLY", "YEARLY"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              aria-pressed={cycle === c}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                cycle === c ? "bg-amber-500 text-slate-950" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {c === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <div className={cn("rounded-xl border p-4 text-sm", expired ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60")}>
          <p className={cn("font-semibold", expired ? "text-rose-900" : "text-amber-900")}>
            {current.plan} · {formatUsd(current.priceUsd)} / {current.billingCycle === "MONTHLY" ? t("billingMonthly").toLowerCase() : t("billingYearly").toLowerCase()}
            {expired && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">{t("subExpiresBadge")}</span>}
          </p>
          <p className={cn("mt-0.5 text-xs", expired ? "text-rose-800/80" : "text-amber-800/80")}>
            {t("subRenews", { d: formatDateTime(current.currentPeriodEnd, locale) })} · {t("subSeats", { n: current.seats })}
          </p>
          {(expired || current.status === "PAST_DUE") && (
            <p className="mt-1.5 text-xs font-medium text-rose-800">{t("subPayFirst")}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isCurrent = current?.plan === p.plan && !expired;
          const price = cycle === "MONTHLY" ? p.priceUsdMonthly : p.priceUsdYearly;
          const isPaid = p.plan !== "FREE";
          const freeBlocked = p.plan === "FREE" && freeDisabled;
          return (
            <div
              key={p.plan}
              className={cn(
                "flex flex-col rounded-xl border bg-white p-4",
                isCurrent ? "border-amber-400 ring-1 ring-amber-200" : "border-slate-200",
                freeBlocked && "opacity-70"
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">{p.plan}</p>
                {isCurrent && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t("subCurrentBadge")}</span>}
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {p.plan === "FREE" ? "$0" : formatUsd(price)}
                {p.plan !== "FREE" && <span className="text-xs font-medium text-slate-400"> / {cycle === "MONTHLY" ? t("billingMonthly").toLowerCase() : t("billingYearly").toLowerCase()}</span>}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                <li>· {t("kpiListings")}: {p.listingsLimit}</li>
                <li>· {t("actFeature")}: {p.featuredLimit}</li>
                <li>· {t("subSeats", { n: p.seats })}</li>
                {p.features.map((f) => (
                  <li key={f.en}>· {f[locale]}</li>
                ))}
              </ul>
              {freeBlocked && (
                <p className="mt-2 text-[11px] font-medium text-rose-700">{t("payFreeDisabledNotice")}</p>
              )}
              <Button
                size="sm"
                className="mt-4 w-full"
                variant={isCurrent ? "secondary" : "default"}
                disabled={isCurrent || downgrading || freeBlocked || (p.plan === "FREE" && (!current || current.plan === "FREE"))}
                onClick={() => (isPaid ? setRequesting(p) : downgrade())}
                aria-label={isPaid ? t("payOpen") : t("subFreeDowngrade")}
              >
                {downgrading && !isPaid && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />}
                {isCurrent ? t("subCurrentBadge") : isPaid ? (current && current.plan !== "FREE" ? t("payRenew") : t("payOpen")) : t("subFreeDowngrade")}
              </Button>
            </div>
          );
        })}
      </div>

      <TenantPaymentHistory key={historyKey} onChanged={refetch} />

      <RequestSubscriptionDialog
        open={requesting !== null}
        onOpenChange={(o) => !o && setRequesting(null)}
        plan={requesting}
        cycle={cycle}
        priceUsd={requesting ? (cycle === "MONTHLY" ? requesting.priceUsdMonthly : requesting.priceUsdYearly) : 0}
        onDone={() => { refetch(); setRequesting(null); setHistoryKey((k) => k + 1); }}
      />
    </div>
  );
}

// ---------------- dealer profile settings ----------------

function DealerSettings() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const meDash = useFetch<TenantDashboardDTO>("/api/tenant/me");
  const [form, setForm] = useState<Partial<TenantDashboardDTO["tenant"]> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meDash.data?.tenant) setForm(meDash.data.tenant);
  }, [meDash.data?.tenant]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await apiSend("/api/tenant/profile", "PATCH", {
        name: form.name,
        bio: form.bio,
        bioKm: form.bioKm,
        city: form.city,
        address: form.address,
        phone: form.phone,
        telegram: form.telegram,
      });
      toast.success(t("toastUpdated"));
      meDash.refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (meDash.loading && !meDash.data) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (meDash.error && !meDash.data) return <FetchErrorState message={meDash.error} onRetry={meDash.refetch} />;
  const tenant = meDash.data?.tenant;
  if (!tenant || !form) return null;

  return (
    <SectionCard title={t("tenantProfile")}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <VerificationBadge verification={tenant.verification} />
        <span>{t("sellerSince", { y: new Date(tenant.memberSince).getFullYear() })}</span>
        <span className="text-slate-300">·</span>
        <span className="font-mono">{tenant.slug}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="tp-name" className="text-xs text-slate-500">{t("tenantName")}</Label>
          <Input id="tp-name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div>
          <Label htmlFor="tp-city" className="text-xs text-slate-500">{t("formCity")}</Label>
          <Input id="tp-city" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div>
          <Label htmlFor="tp-phone" className="text-xs text-slate-500">{t("invitePhone")}</Label>
          <Input id="tp-phone" type="tel" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tp-address" className="text-xs text-slate-500">{t("tenantAddress")}</Label>
          <Input id="tp-address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1.5 h-9" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tp-telegram" className="text-xs text-slate-500">{t("tenantTelegram")}</Label>
          <Input id="tp-telegram" value={form.telegram ?? ""} onChange={(e) => setForm({ ...form, telegram: e.target.value })} className="mt-1.5 h-9" placeholder="@dealer" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tp-bio" className="text-xs text-slate-500">{t("tenantBio")}</Label>
          <Textarea id="tp-bio" value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-1.5" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tp-biokm" className="text-xs text-slate-500">{t("tenantBioKm")}</Label>
          <Textarea
            id="tp-biokm" value={form.bioKm ?? ""} onChange={(e) => setForm({ ...form, bioKm: e.target.value })} rows={3}
            className={cn("mt-1.5", locale === "km" && "font-khmer")}
          />
        </div>
      </div>
      <Button onClick={save} disabled={saving} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
        {t("saveChanges")}
      </Button>
    </SectionCard>
  );
}
