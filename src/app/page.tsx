"use client";

import { useAppStore } from "@/lib/store";
import { useFetch } from "@/lib/client-hooks";
import { translate, isLocale, type Locale } from "@/lib/i18n";
import type { SessionDTO } from "@/lib/dashboard-types";
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
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
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

/** Per-locale typography: Khmer gets the Kantumruy Pro stack, Chinese gets a
 *  CJK system stack; Vietnamese/Latin render fine with the default (Inter). */
function fontClassFor(locale: Locale): string {
  if (locale === "km") return "font-khmer";
  if (locale === "zh") return "font-cjk";
  return "";
}

function CurrentView() {
  const view = useAppStore((s) => s.view);
  switch (view.name) {
    case "home":
      return <HomeView />;
    case "browse":
      return <BrowseView key={`${view.q ?? ""}|${view.make ?? ""}|${view.bodyType ?? ""}|${view.sort ?? ""}|${view.category ?? ""}`} initial={view} />;
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
    case "auth":
      return <AuthView key={view.tab ?? "login"} initialTab={view.tab} />;
    case "dashboard":
      return <DashboardView />;
    default:
      return <HomeView />;
  }
}

export default function Page() {
  const locale = useAppStore((s) => s.locale);
  // Telegram theme adoption: applied directly to the DOM only when running
  // inside the Mini App, so the normal web look is untouched and no
  // setState-in-effect is needed.
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={rootRef}
      className="flex min-h-screen flex-col bg-slate-50"
    >
      <div className={cn(fontClassFor(locale))}>
        <Header />
      </div>
      <main className="flex-1 flex flex-col" id="main">
        <div className={cn("flex-1", fontClassFor(locale))}>
          <FavoritesBoot />
          <SessionBoot />
          <TelegramBoot />
          <CurrentView />
        </div>
      </main>
      <div className={cn(fontClassFor(locale))}>
        <Footer />
      </div>
      <MobileNav />
    </div>
  );
}
