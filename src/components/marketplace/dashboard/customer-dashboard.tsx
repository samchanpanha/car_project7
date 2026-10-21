"use client";

// Customer (buyer / private seller) dashboard — overview, favorites, saved searches, appointments, reports.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { timeAgo } from "@/lib/format";
import { bodyTypeLabels, fuelLabels, transmissionLabels, drivetrainLabels } from "@/lib/i18n";
import type { AccountOverviewDTO, AppointmentDTO, SavedSearchDTO, SessionDTO } from "@/lib/dashboard-types";
import type { VehiclesResponseDTO } from "@/lib/types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { DashboardShell, type DashboardTabDef } from "./shell";
import { PurchaseRequestList } from "./purchase-list";
import { SellerInventory, SellerSubscription } from "./seller-tabs";
import { SellerTelegram } from "./seller-telegram";
import {
  AppointmentStatusBadge, ConfidenceRing, EmptyState, FetchErrorState, SectionCard, StatCard,
  StatCardSkeleton, errorText, formatDateTime, isForbidden,
} from "./bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays, Car, CreditCard, FileCheck2, Handshake, Heart, LayoutDashboard, MessageSquare, Play, Search,
  Send, Trash2, TriangleAlert, X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CustomerDashboard({ me }: { me: SessionDTO }) {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const active = (view.name === "dashboard" && view.tab) || "overview";
  const setTab = (tab: string) => navigate({ name: "dashboard", tab });

  // Individually-registered sellers/dealers (no dealership yet) get selling
  // tools too: their own inventory ("add car for sell") and the platform
  // free-trial subscription. Tenant members see the DealerDashboard instead.
  const isSellerish = me.user.role === "SELLER" || me.user.role === "DEALER";

  const tabs: DashboardTabDef[] = [
    { id: "overview", label: t("tabOverview"), icon: LayoutDashboard },
    { id: "purchases", label: t("tabPurchases"), icon: Handshake },
    { id: "favorites", label: t("navFavorites"), icon: Heart },
    { id: "saved-searches", label: t("tabSavedSearches"), icon: Search },
    { id: "appointments", label: t("tabAppointments"), icon: CalendarDays },
    { id: "reports", label: t("tabMyReports"), icon: FileCheck2 },
    // private sellers also manage purchase requests on their own listings
    ...(me.user.role === "SELLER"
      ? [{ id: "sales", label: t("tabSalesRequests"), icon: Car } as DashboardTabDef]
      : []),
    ...(isSellerish
      ? [
          { id: "inventory", label: t("tabInventoryMine"), icon: Car } as DashboardTabDef,
          { id: "subscription", label: t("tabSubscription"), icon: CreditCard } as DashboardTabDef,
          { id: "telegram", label: t("tabTelegram"), icon: Send } as DashboardTabDef,
        ]
      : []),
  ];

  return (
    <DashboardShell
      greeting={t("dashboardWelcome", { name: me.user.name })}
      subtitle={t("dashboardCustomerSub")}
      badge={
        <span className="text-xs font-medium text-slate-500">
          {me.user.role === "BUYER" ? t("roleBUYER") : me.user.role === "DEALER" ? t("roleDEALER") : t("roleSELLER")}
        </span>
      }
      tabs={tabs}
      active={active}
      onTab={setTab}
    >
      {active === "overview" && <CustomerOverview />}
      {active === "purchases" && <PurchaseRequestList url="/api/account/purchases" mode="buyer" />}
      {active === "favorites" && <CustomerFavorites />}
      {active === "saved-searches" && <CustomerSavedSearches />}
      {active === "appointments" && <CustomerAppointments />}
      {active === "reports" && <CustomerReports />}
      {active === "sales" && me.user.role === "SELLER" && (
        <PurchaseRequestList url="/api/seller/purchase-requests" mode="seller" />
      )}
      {active === "inventory" && isSellerish && <SellerInventory />}
      {active === "subscription" && isSellerish && <SellerSubscription />}
      {active === "telegram" && isSellerish && <SellerTelegram />}
    </DashboardShell>
  );
}

// ---------------- overview ----------------

function CustomerOverview() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const ov = useFetch<AccountOverviewDTO>("/api/account/overview");
  const appts = useFetch<AppointmentDTO[]>("/api/account/appointments");

  if (ov.loading && !ov.data) {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
      </>
    );
  }
  if (ov.error && !ov.data) return <FetchErrorState message={ov.error} onRetry={ov.refetch} />;
  const o = ov.data;
  if (!o) return null;

  const upcoming = (appts.data ?? [])
    .filter((a) => a.status !== "CANCELLED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Heart} label={t("kpiFavorites")} value={o.favorites} onClick={() => navigate({ name: "favorites" })} />
        <StatCard icon={Search} label={t("kpiSavedSearches")} value={o.savedSearches} onClick={() => navigate({ name: "dashboard", tab: "saved-searches" })} />
        <StatCard icon={CalendarDays} label={t("kpiAppointments")} value={o.appointments} onClick={() => navigate({ name: "dashboard", tab: "appointments" })} />
        <StatCard icon={FileCheck2} label={t("kpiReports")} value={o.reportsGenerated} onClick={() => navigate({ name: "dashboard", tab: "reports" })} />
        <StatCard icon={MessageSquare} label={t("kpiMessages")} value={o.messagesCount} onClick={() => navigate({ name: "messages" })} />
      </div>

      <SectionCard title={t("upcomingAppointment")}>
        {appts.loading && !appts.data ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : !upcoming ? (
          <EmptyState icon={CalendarDays} text={t("noUpcoming")} hint={t("apptEmptyHint")} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {upcoming.vehicle.make} {upcoming.vehicle.model} {upcoming.vehicle.year}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(upcoming.scheduledAt, locale)} · {upcoming.sellerName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AppointmentStatusBadge status={upcoming.status} />
              <Button variant="outline" size="sm" onClick={() => navigate({ name: "detail", vehicleId: upcoming.vehicle.id })}>
                <Car className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                {t("specifications")}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t("recentReports")}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: "dashboard", tab: "reports" })} className="text-xs text-amber-700 hover:text-amber-800">
            {t("viewAll")}
          </Button>
        }
      >
        {o.recentReports.length === 0 ? (
          <EmptyState icon={FileCheck2} text={t("reportsEmpty")} hint={t("reportsEmptyHint")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {o.recentReports.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{r.vehicleLabel}</p>
                  <p className="text-[11px] text-slate-400">{timeAgo(r.createdAt, locale)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ConfidenceRing value={r.confidence} size={44} />
                  <Button variant="outline" size="sm" onClick={() => navigate({ name: "report", vehicleId: r.vehicleId })}>
                    {t("actViewReport")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

// ---------------- favorites ----------------

function CustomerFavorites() {
  const t = useT();
  const favorites = useAppStore((s) => s.favorites);
  const { data, loading } = useFetch<VehiclesResponseDTO>(favorites.length > 0 ? `/api/vehicles?limit=48&sort=newest` : null);
  const favItems = (data?.items ?? []).filter((v) => favorites.includes(v.id));

  if (loading && !data) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <VehicleCardSkeleton key={i} />)}
      </div>
    );
  }
  if (favItems.length === 0) {
    return <EmptyState icon={Heart} text={t("noFavorites")} hint={t("noFavoritesHint")} className="p-10" />;
  }
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {favItems.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
    </div>
  );
}

// ---------------- saved searches ----------------

function CustomerSavedSearches() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<SavedSearchDTO[]>("/api/account/saved-searches");
  const [deleting, setDeleting] = useState<SavedSearchDTO | null>(null);
  const [running, setRunning] = useState<{ name: string; vehicles: VehiclesResponseDTO["items"] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (s: SavedSearchDTO) => {
    setBusyId(s.id);
    try {
      const res = await apiSend<{ total: number; vehicles: VehiclesResponseDTO["items"] }>(
        `/api/account/saved-searches/${s.id}/run`, "POST"
      );
      setRunning({ name: s.name, vehicles: res.vehicles ?? [] });
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: SavedSearchDTO) => {
    setBusyId(s.id);
    try {
      await apiSend(`/api/account/saved-searches/${s.id}`, "DELETE");
      toast.success(t("toastDeleted"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  };

  if (loading && !data) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Search}
        text={t("savedSearchEmpty")}
        hint={t("savedSearchEmptyHint")}
        className="p-10"
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {data.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {t("listedAgo", { t: timeAgo(s.createdAt, locale) })}
                  {typeof s.resultCount === "number" ? ` · ${s.resultCount}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => run(s)} disabled={busyId === s.id}>
                  {busyId === s.id ? <Play className="h-3.5 w-3.5 mr-1 animate-pulse" aria-hidden /> : <Play className="h-3.5 w-3.5 mr-1" aria-hidden />}
                  {t("actRunSearch")}
                </Button>
                <AlertDialog open={deleting?.id === s.id} onOpenChange={(o) => !o && setDeleting(null)}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => setDeleting(s)}
                      aria-label={`${t("actDeleteSearch")} ${s.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteSearchTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("deleteSearchBody", { name: s.name })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); remove(s); }}
                        className="bg-rose-600 text-white hover:bg-rose-700"
                      >
                        {t("actDeleteSearch")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <SearchQueryChips query={s.query} />
            </div>
          </div>
        ))}
      </div>

      {/* Run results dialog */}
      <Dialog open={Boolean(running)} onOpenChange={(o) => !o && setRunning(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("runResultsTitle", { name: running?.name ?? "" })} ({running?.vehicles.length ?? 0})</DialogTitle>
          </DialogHeader>
          {running && running.vehicles.length === 0 ? (
            <EmptyState icon={Search} text={t("noResults")} hint={t("noResultsHint")} />
          ) : (
            <div className="grid max-h-96 gap-3 overflow-y-auto kl-scroll grid-cols-1 sm:grid-cols-2">
              {running?.vehicles.map((v) => (
                <div key={v.id} onClick={() => { setRunning(null); navigate({ name: "detail", vehicleId: v.id }); }} className="cursor-pointer rounded-xl [&>article]:h-full">
                  <VehicleCard vehicle={v} showCompare={false} />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Humanized filter chips for a saved-search query object. */
function SearchQueryChips({ query }: { query: Record<string, string | number> }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const label = (k: string): string => {
    switch (k) {
      case "q": return "“…”";
      case "make": return t("formMake");
      case "bodyType": return t("bodyType");
      case "fuel": return t("fuelType");
      case "transmission": return t("transmission");
      case "drivetrain": return t("specDrivetrain");
      case "condition": return t("formCondition");
      case "city": return t("location");
      case "sellerType": return t("sellerType");
      case "sellerVerified": return t("verifiedOnly");
      case "featured": return t("featuredOnly");
      case "hasReport": return t("hasReport");
      case "priceMin": return `${t("priceRange")} ≥`;
      case "priceMax": return `${t("priceRange")} ≤`;
      case "yearMin": return t("yearMin");
      case "yearMax": return t("advYearMax");
      case "mileageMin": return t("advMileageMin");
      case "mileageMax": return t("mileageMax");
      default: return k;
    }
  };
  const value = (k: string, v: string | number): string => {
    const mapOf: Record<string, Record<string, { en: string; km: string }>> = {
      bodyType: bodyTypeLabels, fuel: fuelLabels, transmission: transmissionLabels, drivetrain: drivetrainLabels,
    };
    if (mapOf[k]) {
      return String(v).split(",").map((x) => mapOf[k][x]?.[locale] ?? x).join(", ");
    }
    if (v === "true") return "";
    return String(v);
  };
  return (
    <>
      {Object.entries(query)
        .filter(([k, v]) => k !== "sort" && k !== "limit" && k !== "cursor" && v !== "" && v !== undefined)
        .map(([k, v]) => {
          const val = value(k, v);
          return (
            <span key={k} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
              {label(k)}
              {val && <span className="font-medium text-slate-800">: {val}</span>}
            </span>
          );
        })}
    </>
  );
}

// ---------------- appointments ----------------

function CustomerAppointments() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<AppointmentDTO[]>("/api/account/appointments");
  const [busyId, setBusyId] = useState<string | null>(null);

  const cancel = async (a: AppointmentDTO) => {
    setBusyId(a.id);
    try {
      await apiSend(`/api/account/appointments/${a.id}`, "PATCH", { status: "CANCELLED" });
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data || data.length === 0) return <EmptyState icon={CalendarDays} text={t("apptEmpty")} hint={t("apptEmptyHint")} />;

  return (
    <div className="space-y-2.5">
      {data.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
          <button
            onClick={() => navigate({ name: "detail", vehicleId: a.vehicle.id })}
            className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 cursor-pointer"
            aria-label={`${a.vehicle.make} ${a.vehicle.model}`}
          >
            {a.vehicle.thumbnail ? (
              <img src={a.vehicle.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <Car className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {a.vehicle.make} {a.vehicle.model} {a.vehicle.year}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(a.scheduledAt, locale)} · {a.sellerName}
            </p>
            {a.notes && <p className="mt-1 truncate text-xs italic text-slate-400">“{a.notes}”</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={a.status} />
            {(a.status === "REQUESTED" || a.status === "CONFIRMED") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={busyId === a.id} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                    <X className="h-3.5 w-3.5 mr-1" aria-hidden />
                    {t("actCancelAppt")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("cancelApptTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("cancelApptBody")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); cancel(a); }}
                      className="bg-rose-600 text-white hover:bg-rose-700"
                    >
                      {t("actCancelAppt")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- reports ----------------

function CustomerReports() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<AccountOverviewDTO>("/api/account/overview");

  if (loading && !data) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  const reports = data?.recentReports ?? [];

  return (
    <div className="space-y-3">
      {reports.length === 0 ? (
        <EmptyState icon={FileCheck2} text={t("reportsEmpty")} hint={t("reportsEmptyHint")} />
      ) : (
        reports.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <ConfidenceRing value={r.confidence} size={64} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{r.vehicleLabel}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {t("confidence")} {Math.round(r.confidence)}% · {timeAgo(r.createdAt, locale)}
              </p>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => navigate({ name: "report", vehicleId: r.vehicleId })}
              className="border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              <FileCheck2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              {t("actViewReport")}
            </Button>
          </div>
        ))
      )}
      <p className={cn("text-[11px] text-slate-400", reports.length === 0 && "hidden")}>
        <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden />
        {t("reportsEmptyHint")}
      </p>
    </div>
  );
}
