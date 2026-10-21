"use client";

import { create } from "zustand";
import type { SortOption } from "./types";
import type { SessionDTO } from "./dashboard-types";

export type View =
  | { name: "home" }
  | { name: "browse"; q?: string; make?: string; bodyType?: string; sort?: SortOption }
  | { name: "detail"; vehicleId: string }
  | { name: "report"; vehicleId: string }
  | { name: "sell" }
  | { name: "messages"; conversationId?: string }
  | { name: "favorites" }
  | { name: "seller"; userId: string }
  | { name: "compare" }
  | { name: "auth" }
  | { name: "dashboard"; tab?: string };

interface AppState {
  locale: "en" | "km";
  setLocale: (l: "en" | "km") => void;
  view: View;
  navigate: (v: View) => void;
  /** global search text typed in the header (browse reads it) */
  compare: string[];
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
  favorites: string[];
  setFavorites: (ids: string[]) => void;
  toggleFavoriteLocal: (id: string) => void;
  /** current demo session (persona) — null until /api/session resolves */
  me: SessionDTO | null;
  setMe: (s: SessionDTO | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  locale: "en",
  setLocale: (locale) => set({ locale }),
  view: { name: "home" },
  navigate: (view) => {
    set({ view });
    if (typeof window !== "undefined") {
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
  me: null,
  setMe: (me) => set({ me }),
}));
