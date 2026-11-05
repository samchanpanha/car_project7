"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { toast } from "sonner";
import { useAppStore, type View } from "@/lib/store";
import { useFetch } from "@/lib/client-hooks";
import { translate, isLocale, type Locale } from "@/lib/i18n";
import type { SessionDTO } from "@/lib/dashboard-types";
import type { VehicleDetailPayload } from "@/lib/backend";
import { pathToView } from "@/lib/routes";
import { registerRouter } from "@/lib/router-bridge";
import { cn } from "@/lib/utils";
import {
  isInTelegram,
  initTelegram,
  tgSendAuth,
  setupBackButton,
  getTmaStartParam,
  parseTmaDeepLink,
  type TgBackButtonHandle,
} from "@/lib/telegram";
import { Header } from "@/components/marketplace/header";
import { Footer } from "@/components/marketplace/footer";
import { MobileNav } from "@/components/marketplace/mobile-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeView } from "@/components/marketplace/views/home-view";
import { BrowseView } from "@/components/marketplace/views/browse-view";
import { DetailView } from "@/components/marketplace/views/detail-view";
import { ReportView } from "@/components/marketplace/views/report-view";
import { SellView } from "@/components/marketplace/views/sell-view";
import { MessagesView } from "@/components/marketplace/views/messages-view";
import { FavoritesView } from "@/components/marketplace/views/favorites-view";
import { SellerView } from "@/components/marketplace/views/seller-view";
import { CompareView } from "@/components/marketplace/views/compare-view";
import { AuthView } from "@/components/marketplace/views/auth-view";
import { DashboardView } from "@/components/marketplace/dashboard/dashboard-view";
import { GuideView } from "@/components/marketplace/views/guide-view";
import { TrustView } from "@/components/marketplace/views/trust-view";
import { FinancingView } from "@/components/marketplace/views/financing-view";
import { EvView } from "@/components/marketplace/views/ev-view";
import { RealtimeNotifications } from "@/components/marketplace/notification-center";

/** Boots favorites into the global store on first load. */
function FavoritesBoot() {
  const setFavorites = useAppStore((s) => s.setFavorites);
  const { data } = useFetch<{ vehicleIds: string[] }>("/api/favorites");
  useEffect(() => {
    if (data?.vehicleIds) setFavorites(data.vehicleIds);

  }, [data?.vehicleIds.join(",")]);
  return null;
}

/** Boots the session (persona or real auth) into the global store once per
 *  page load. After login/persona switch the page reloads, so this refetches.
 *  One-shot toasts parked before a reload are replayed in a separate
 *  mount-only effect so locale changes never re-apply stale session data. */
function SessionBoot() {
  const setMe = useAppStore((s) => s.setMe);
  const { data } = useFetch<SessionDTO>("/api/session");
  useEffect(() => {
    if (!data) return;
    setMe(data);
    // A real account's locale is the user's own configuration — apply it on
    // boot (demo personas keep the manual toggle default). For everyone else
    // restore the language picked via the header toggle (localStorage).
    if (data.authed && isLocale(data.user.locale)) {
      useAppStore.getState().setLocale(data.user.locale);
    } else {
      try {
        const saved = window.localStorage.getItem("khlan_locale");
        if (saved && isLocale(saved) && saved !== useAppStore.getState().locale) {
          useAppStore.getState().setLocale(saved);
        }
      } catch {
        /* localStorage unavailable — keep default locale */
      }
    }
    // Replay the post-login redirect (set by the auth view): every signed-in
    // role lands directly on their dashboard — admin tools / dealer tools /
    // customer account — so the dashboard is impossible to miss after login.
    try {
      if (sessionStorage.getItem("khlan_go_dashboard")) {
        sessionStorage.removeItem("khlan_go_dashboard");
        // Authed users only — a guest (stale flag, failed session) is never
        // taken to the dashboard; they keep the public experience.
        if (data.authed) {
          useAppStore.getState().navigate({ name: "dashboard" });
        }
      }
    } catch {
      /* sessionStorage unavailable — skip replay */
    }
  }, [data, setMe]);

  useEffect(() => {
    try {
      const loc = useAppStore.getState().locale;
      const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
        translate(loc, key, vars);
      const switched = sessionStorage.getItem("khlan_switched");
      if (switched) {
        sessionStorage.removeItem("khlan_switched");
        toast.success(tr("toastSwitched", { name: switched }));
      }
      const welcomeRaw = sessionStorage.getItem("khlan_welcome");
      if (welcomeRaw) {
        sessionStorage.removeItem("khlan_welcome");
        const w = JSON.parse(welcomeRaw) as { name?: string };
        toast.success(tr("authWelcomeBack", { name: w.name ?? "" }));
      }
      const loggedOut = sessionStorage.getItem("khlan_loggedout");
      if (loggedOut) {
        sessionStorage.removeItem("khlan_loggedout");
        toast.success(tr("toastLoggedOut"));
      }
    } catch {
      /* sessionStorage unavailable — skip replay */
    }
  }, []);
  return null;
}

/** Telegram Mini App boot (Task 6-a): theme init + one-shot initData auth
 *  handshake + native BackButton wired to SPA navigation. Everything here is
 *  a no-op in a plain browser (feature-detected in src/lib/telegram.ts). */
function TelegramBoot() {
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const backRef = useRef<TgBackButtonHandle | null>(null);

  // One-shot auth: init → send initData → reload once so SessionBoot picks up
  // the new khlan_auth cookie (sessionStorage guard prevents reload loops).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isInTelegram()) return;
      await initTelegram();

      // Deep link routing (startapp=vehicle_<id> etc.)
      const startParam = getTmaStartParam();
      const deepTarget = parseTmaDeepLink(startParam);
      if (deepTarget && !cancelled) {
        navigate(deepTarget);
      }

      const authed = await tgSendAuth();
      if (!authed || cancelled) return;
      try {
        if (!sessionStorage.getItem("khlan_tg_authed")) {
          sessionStorage.setItem("khlan_tg_authed", "1");
          window.location.reload();
          return;
        }
      } catch {
        /* no sessionStorage — stay without reload */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Wire the native BackButton once; toggle visibility per view.
  // Only inside a real Mini App session — plain browsers (and the telegram
  // script's v6.0 stub) have no BackButton support, so stay silent there.
  useEffect(() => {
    if (!isInTelegram()) return;
    backRef.current = setupBackButton(() => navigate({ name: "home" }));
    return () => backRef.current?.hide();
  }, [navigate]);

  useEffect(() => {
    const ctrl = backRef.current;
    if (!ctrl) return;
    if (view.name === "home") ctrl.hide();
    else ctrl.show();
  }, [view.name]);

  return null;
}

/** Per-locale typography: Khmer gets Battambang, Chinese gets a
 *  CJK system stack; Vietnamese/Latin render fine with the default (Inter). */
function fontClassFor(locale: Locale): string {
  if (locale === "km") return "font-khmer";
  if (locale === "zh") return "font-cjk";
  return "";
}

function CurrentView({
  view,
  initialVehicle,
}: {
  view: View;
  initialVehicle?: VehicleDetailPayload;
}) {
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "browse":
      return <BrowseView key={`${view.q ?? ""}|${view.make ?? ""}|${view.bodyType ?? ""}|${view.sort ?? ""}|${view.category ?? ""}`} initial={view} />;
    case "detail":
      return <DetailView key={view.vehicleId} vehicleId={view.vehicleId} initial={initialVehicle} />;
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
    case "auth":
      return <AuthView key={view.tab ?? "login"} initialTab={view.tab} />;
    case "dashboard":
      return <DashboardView />;
    case "guide":
      return <GuideView key={view.tab ?? "default"} initialTab={view.tab} />;
    case "trust":
      return <TrustView />;
    case "financing":
      return <FinancingView price={view.price} />;
    case "ev":
      return <EvView />;
    default:
      return <HomeView />;
  }
}

export interface AppChromeProps {
  /** The view the server rendered for this URL. Used for the first paint so
   *  crawlers (and users before hydration) see the right screen. */
  initialView: View;
  /** Server-fetched listing payload for `/vehicles/[id]`. */
  initialVehicle?: VehicleDetailPayload;
}

export function AppChrome({ initialView, initialVehicle }: AppChromeProps) {
  return (
    // `useSearchParams` forces a client-side bailout on statically
    // prerendered routes — the Suspense boundary keeps those pages buildable.
    <Suspense fallback={<AppChromeFallback />}>
      <AppChromeInner initialView={initialView} initialVehicle={initialVehicle} />
    </Suspense>
  );
}

/** Placeholder shown while the client bundle boots on a prerendered page. */
function AppChromeFallback() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="flex-1 flex flex-col" id="main">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <Skeleton className="h-8 w-64" />
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );
}

function AppChromeInner({ initialView, initialVehicle }: AppChromeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useAppStore((s) => s.locale);
  const storeView = useAppStore((s) => s.view);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Let store.navigate() drive the App Router.
  useEffect(() => {
    registerRouter(router);
    return () => registerRouter(null);
  }, [router]);

  // Once mounted, the URL is the source of truth (deep links, back/forward,
  // and refresh). The server-rendered `initialView` only covers first paint.
  //
  // `pathname` + `searchParams` change whenever the router navigates, so the
  // effect re-syncs on every route change. The `popstate` listener covers the
  // browser's own back/forward buttons, which do not re-render the App Router
  // tree in every Next.js version.
  useEffect(() => {
    const apply = () => {
      const v = pathToView(window.location.pathname, window.location.search);
      useAppStore.setState({ view: v });
      // Remember the browse location so "Back to results" on a detail page can
      // restore the user's filters (not just a bare /browse).
      if (v.name === "browse") {
        useAppStore.getState().setLastBrowsePath(
          window.location.pathname + window.location.search
        );
      }
    };
    apply();
    setMounted(true);
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [pathname, searchParams]);

  const view = mounted ? storeView : initialView;

  // Telegram theme adoption: applied directly to the DOM only when running
  // inside the Mini App, so the normal web look is untouched and no
  // setState-in-effect is needed.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!isInTelegram()) return;
    const el = rootRef.current;
    if (el) {
      el.style.backgroundColor = "var(--tg-bg, #f8fafc)";
      el.style.color = "var(--tg-text, #0f172a)";
    }
  }, []);

  return (
    <div ref={rootRef} className="flex min-h-screen flex-col bg-slate-50">
      <div className={cn(fontClassFor(locale))}>
        <Header />
      </div>
      <main className="flex-1 flex flex-col" id="main">
        <div className={cn("flex-1", fontClassFor(locale))}>
          <FavoritesBoot />
          <SessionBoot />
          <TelegramBoot />
          <RealtimeNotifications />
          <CurrentView view={view} initialVehicle={initialVehicle} />
        </div>
      </main>
      <div className={cn(fontClassFor(locale))}>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
