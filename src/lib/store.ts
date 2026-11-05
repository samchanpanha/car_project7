"use client";

import { create } from "zustand";
import type { SortOption } from "./types";
import type { SessionDTO } from "./dashboard-types";
import { LOCALE_COOKIE, type Locale } from "./i18n";
import { viewToPath } from "./routes";
import { routeTo } from "./router-bridge";

export type View =
  | { name: "home" }
  | {
      name: "browse";
      q?: string;
      make?: string;
      bodyType?: string;
      sort?: SortOption;
      category?: "ALL" | "CAR" | "MOTOR" | "SPARE_PART";
      partTarget?: string;
      partCategory?: string;
    }
  | { name: "detail"; vehicleId: string }
  | { name: "report"; vehicleId: string }
  | { name: "sell" }
  | { name: "messages"; conversationId?: string }
  | { name: "favorites" }
  | { name: "seller"; userId: string }
  | { name: "compare" }
  | { name: "auth"; tab?: "login" | "signup" }
  | { name: "dashboard"; tab?: string }
  | { name: "guide"; tab?: "buyer" | "seller" | "dealer" | "payments" | "faq" }
  | { name: "trust" }
  | { name: "financing"; price?: number }
  | { name: "ev" };

/** A genuine visitor: no real login and no demo persona — browsing is public,
 *  but contacting dealers / favorites / selling require registration. */
export function isGuest(me: SessionDTO | null | undefined): boolean {
  return Boolean(me && !me.authed && !me.demoPersona);
}

interface AppState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  view: View;
  navigate: (v: View) => void;
  /** The most recent browse URL. "Back to results" from a detail page restores
   *  the user's filters instead of dropping them on a bare /browse. */
  lastBrowsePath: string | null;
  setLastBrowsePath: (p: string | null) => void;
  /** global search text typed in the header (browse reads it) */
  compare: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  favorites: string[];
  setFavorites: (ids: string[]) => void;
  toggleFavoriteLocal: (id: string) => void;
  /** In-session notification center (fed by realtime SSE events). */
  notifications: NotifItem[];
  unread: number;
  pushNotification: (n: Pick<NotifItem, "type"> & Partial<Omit<NotifItem, "type" | "id" | "at">>) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  /** current demo session (persona) — null until /api/session resolves */
  me: SessionDTO | null;
  setMe: (s: SessionDTO | null) => void;
}

export interface NotifItem {
  id: string;
  type: string;
  title?: string;
  message?: string;
  payload?: Record<string, unknown>;
  at: number; // epoch ms
}

export const useAppStore = create<AppState>((set, get) => ({
  locale: "en",
  setLocale: (locale) => {
    set({ locale });
    try {
      window.localStorage.setItem("khlan_locale", locale);
    } catch {
      /* localStorage unavailable — locale stays session-only. */
    }
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    } catch {
      /* Cookie unavailable — server-rendered metadata uses English. */
    }
  },
  view: { name: "home" },
  lastBrowsePath: null,
  setLastBrowsePath: (p) => set({ lastBrowsePath: p }),
  navigate: (view) => {
    set({ view });
    if (typeof window !== "undefined") {
      // Mirror the view into the URL so every screen is shareable, crawlable
      // and survives a refresh. `<AppChrome>` re-derives the view from the
      // pathname on mount, so the URL stays the single source of truth.
      const href = viewToPath(view);
      if (href !== `${window.location.pathname}${window.location.search}`) {
        routeTo(href);
      }
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  },
  compare: [],
  toggleCompare: (id) => {
    const cur = get().compare;
    if (cur.includes(id)) {
      set({ compare: cur.filter((c) => c !== id) });
    } else if (cur.length < 3) {
      set({ compare: [...cur, id] });
    }
  },
  clearCompare: () => set({ compare: [] }),
  favorites: [],
  setFavorites: (ids) => set({ favorites: ids }),
  toggleFavoriteLocal: (id) => {
    const cur = get().favorites;
    set({ favorites: cur.includes(id) ? cur.filter((f) => f !== id) : [...cur, id] });
  },
  notifications: [],
  unread: 0,
  pushNotification: (n) => {
    if (n.type === "CONNECTED" || n.type === "PING") return;
    const item: NotifItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: n.type,
      title: n.title,
      message: n.message,
      payload: n.payload,
      at: Date.now(),
    };
    const cur = get().notifications;
    set({ notifications: [item, ...cur].slice(0, 50), unread: get().unread + 1 });
  },
  markNotificationsRead: () => set({ unread: 0 }),
  clearNotifications: () => set({ notifications: [], unread: 0 }),
  me: null,
  setMe: (me) => set({ me }),
}));
