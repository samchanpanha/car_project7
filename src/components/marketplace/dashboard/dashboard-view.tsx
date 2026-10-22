"use client";

// Dashboard role router — Admin/Super Admin → platform tools, tenant member → dealer tools, else customer tools.

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { SessionDTO } from "@/lib/dashboard-types";
import { AdminDashboard } from "./admin-dashboard";
import { DealerDashboard } from "./dealer-dashboard";
import { CustomerDashboard } from "./customer-dashboard";
import { GuestPanel } from "@/components/marketplace/guest-panel";
import { EmptyState, FetchErrorState } from "./bits";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { UserRound } from "lucide-react";

export function DashboardView() {
  const t = useT();
  const me = useAppStore((s) => s.me);
  const setMe = useAppStore((s) => s.setMe);

  // Fallback fetch when SessionBoot hasn't populated the store (or its request failed) —
  // also gives this view its own loading/error UI instead of an eternal spinner.
  const fallback = useFetch<SessionDTO>(me ? null : "/api/session");
  useEffect(() => {
    if (fallback.data && !me) setMe(fallback.data);
  }, [fallback.data, me, setMe]);

  if (!me) {
    if (fallback.loading) {
      return (
        <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-10">
          <Skeleton className="h-8 w-56" />
          <div className="mt-5 grid gap-5 md:grid-cols-[224px_1fr]">
            <Skeleton className="hidden h-72 w-56 rounded-xl md:block" />
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        </div>
      );
    }
    if (fallback.error) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10 pb-28 md:pb-10">
          <EmptyState icon={UserRound} text={t("dashboardSessionError")} hint={fallback.error} className="p-10" />
          <div className="mt-4">
            <FetchErrorState message={fallback.error} onRetry={fallback.refetch} />
          </div>
        </div>
      );
    }
    return null;
  }

  // Genuine guests (no login, no demo persona) must never see the fallback
  // demo buyer's dashboard — that used to look like "I logged in as admin but
  // nothing works". Show the register/login panel instead.
  if (isGuest(me)) {
    return <GuestPanel />;
  }

  if (me.user.role === "SUPER_ADMIN" || me.user.role === "ADMIN") {
    return <AdminDashboard me={me} />;
  }
  if (me.user.role === "DEALER") {
    return <DealerDashboard me={me} />;
  }
  return <CustomerDashboard me={me} />;
}
