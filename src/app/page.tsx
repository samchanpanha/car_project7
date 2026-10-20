"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { SessionDTO } from "@/lib/dashboard-types";
import { Header } from "@/components/marketplace/header";
import { Footer } from "@/components/marketplace/footer";
import { MobileNav } from "@/components/marketplace/mobile-nav";
import { HomeView } from "@/components/marketplace/views/home-view";
import { BrowseView } from "@/components/marketplace/views/browse-view";
import { DetailView } from "@/components/marketplace/views/detail-view";
import { ReportView } from "@/components/marketplace/views/report-view";
import { SellView } from "@/components/marketplace/views/sell-view";
import { MessagesView } from "@/components/marketplace/views/messages-view";
import { FavoritesView } from "@/components/marketplace/views/favorites-view";
import { SellerView } from "@/components/marketplace/views/seller-view";
import { CompareView } from "@/components/marketplace/views/compare-view";
import { DashboardView } from "@/components/marketplace/dashboard/dashboard-view";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { toast } from "sonner";

/** Boots favorites into the global store on first load. */
function FavoritesBoot() {
  const setFavorites = useAppStore((s) => s.setFavorites);
  const { data } = useFetch<{ vehicleIds: string[] }>("/api/favorites");
  useEffect(() => {
    if (data?.vehicleIds) setFavorites(data.vehicleIds);
     
  }, [data?.vehicleIds.join(",")]);
  return null;
}

/** Boots the demo session (persona) into the global store once per page load.
 *  After a persona switch the page reloads, so this refetches automatically. */
function SessionBoot() {
  const t = useT();
  const setMe = useAppStore((s) => s.setMe);
  const { data } = useFetch<SessionDTO>("/api/session");
  useEffect(() => {
    if (!data) return;
    setMe(data);
    // Persona-switch toast: the switch itself reloads the page, so the toast
    // is parked in sessionStorage and replayed here after the reload.
    try {
      const switched = sessionStorage.getItem("khlan_switched");
      if (switched) {
        sessionStorage.removeItem("khlan_switched");
        toast.success(t("toastSwitched", { name: switched }));
      }
    } catch {
      /* sessionStorage unavailable — skip replay */
    }
  }, [data, setMe, t]);
  return null;
}

function CurrentView() {
  const view = useAppStore((s) => s.view);
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "browse":
      return <BrowseView key={`${view.q ?? ""}|${view.make ?? ""}|${view.bodyType ?? ""}|${view.sort ?? ""}`} initial={view} />;
    case "detail":
      return <DetailView key={view.vehicleId} vehicleId={view.vehicleId} />;
    case "report":
      return <ReportView key={view.vehicleId} vehicleId={view.vehicleId} />;
    case "sell":
      return <SellView />;
    case "messages":
      return <MessagesView key={view.conversationId ?? "list"} conversationId={view.conversationId} />;
    case "favorites":
      return <FavoritesView />;
    case "seller":
      return <SellerView key={view.userId} userId={view.userId} />;
    case "compare":
      return <CompareView />;
    case "dashboard":
      return <DashboardView />;
    default:
      return <HomeView />;
  }
}

export default function Page() {
  const locale = useAppStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale === "km" ? "km" : "en";
  }, [locale]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className={cn(locale === "km" && "font-khmer")}>
        <Header />
      </div>
      <main className="flex-1 flex flex-col" id="main">
        <div className={cn("flex-1", locale === "km" && "font-khmer")}>
          <FavoritesBoot />
          <SessionBoot />
          <CurrentView />
        </div>
      </main>
      <div className={cn(locale === "km" && "font-khmer")}>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
