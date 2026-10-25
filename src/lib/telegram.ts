// KhLan Telegram Mini App (TMA) Comprehensive Support.
// Feature-detected everywhere: when the app runs outside Telegram (or offline),
// every helper degrades to a safe no-op / false, so normal web browsing is 100% intact.

import type { View } from "./store";

// ---------- Types ----------

export interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
}

export interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

export interface TgMainButton {
  text: string;
  color: string;
  textColor: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setText(text: string): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
}

export interface TgHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  version?: string;
  platform?: string;
  colorScheme?: "light" | "dark";
  themeParams?: TgThemeParams;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  headerColor?: string;
  backgroundColor?: string;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  openLink?(url: string, options?: { try_instant_view?: boolean }): void;
  HapticFeedback?: TgHapticFeedback;
  BackButton?: TgBackButton;
  MainButton?: TgMainButton;
}

interface TelegramWindow {
  Telegram?: { WebApp?: TgWebApp };
}

// ---------- Accessors ----------

/** The Telegram WebApp instance, or null outside Telegram / before script load. */
export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as TelegramWindow;
  return w.Telegram?.WebApp ?? null;
}

/** True when the page was opened as a Mini App with real initData attached. */
export function isInTelegram(): boolean {
  return Boolean(tg()?.initData);
}

// ---------- Init & Theme Sync ----------

/**
 * One-time Mini App setup: ready(), expand(), dark header, and theme bridging
 * onto CSS variables so components can adapt to Telegram appearance.
 */
export async function initTelegram(): Promise<{ linked: boolean }> {
  if (typeof window === "undefined") return { linked: false };
  const app = tg();
  if (!app) return { linked: false };

  try {
    app.ready();
    app.expand();
    app.setHeaderColor("#020617"); // slate-950 — matches KhLan header
    if (app.setBackgroundColor) {
      app.setBackgroundColor("#020617");
    }
  } catch {
    /* older clients: ignore */
  }

  const theme = app.themeParams ?? {};
  const root = document.documentElement;
  const vars: Array<[string, string | undefined]> = [
    ["--tg-bg", theme.bg_color ?? theme.secondary_bg_color],
    ["--tg-text", theme.text_color],
    ["--tg-hint", theme.hint_color],
    ["--tg-button", theme.button_color],
    ["--tg-button-text", theme.button_text_color],
  ];
  for (const [name, value] of vars) {
    if (value) root.style.setProperty(name, value);
  }
  return { linked: Boolean(app.initData) };
}

// ---------- Auth Handshake ----------

let tgAuthSent = false;

/**
 * POST /api/auth/telegram with the real initData.
 * In Admin-Only mode, if the Telegram user is not an Admin, the backend rejects with 403,
 * and we gracefully allow guest browsing instead of failing.
 */
export async function tgSendAuth(): Promise<boolean> {
  const app = tg();
  if (!app?.initData || tgAuthSent) return false;
  tgAuthSent = true;
  try {
    const res = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: app.initData }),
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return json?.ok === true;
  } catch {
    return false;
  }
}

// ---------- Haptics ----------

/** Safe haptic wrapper — no-op outside Telegram or on unsupported clients. */
export function tgHaptic(type: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
  try {
    tg()?.HapticFeedback?.impactOccurred(type);
  } catch {
    /* ignore */
  }
}

export function tgHapticNotification(type: "error" | "success" | "warning"): void {
  try {
    tg()?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* ignore */
  }
}

export function tgHapticSelection(): void {
  try {
    tg()?.HapticFeedback?.selectionChanged();
  } catch {
    /* ignore */
  }
}

// ---------- Back Button ----------

export interface TgBackButtonHandle {
  show(): void;
  hide(): void;
}

export function setupBackButton(onClick: () => void): TgBackButtonHandle | null {
  const bb = tg()?.BackButton;
  if (!bb) return null;
  let wired = false;
  try {
    bb.onClick(onClick);
    wired = true;
  } catch {
    return null;
  }
  return {
    show: () => {
      try {
        bb.show();
      } catch {
        /* ignore */
      }
    },
    hide: () => {
      try {
        if (wired) bb.offClick(onClick);
      } catch {
        /* ignore */
      }
      try {
        bb.hide();
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------- Main Button ----------

export interface TgMainButtonHandle {
  show(text: string, onClick: () => void): void;
  hide(): void;
  setLoading(loading: boolean): void;
}

export function setupMainButton(): TgMainButtonHandle | null {
  const mb = tg()?.MainButton;
  if (!mb) return null;
  let currentCb: (() => void) | null = null;

  return {
    show: (text: string, cb: () => void) => {
      try {
        if (currentCb) mb.offClick(currentCb);
        currentCb = cb;
        mb.setText(text);
        mb.onClick(cb);
        mb.show();
      } catch {
        /* ignore */
      }
    },
    hide: () => {
      try {
        if (currentCb) {
          mb.offClick(currentCb);
          currentCb = null;
        }
        mb.hide();
      } catch {
        /* ignore */
      }
    },
    setLoading: (loading: boolean) => {
      try {
        if (loading) mb.showProgress(false);
        else mb.hideProgress();
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------- Deep Linking Parser ----------

/** Extract the start_param from Telegram WebApp initDataUnsafe or window.location query */
export function getTmaStartParam(): string | null {
  if (typeof window === "undefined") return null;
  const app = tg();
  if (app?.initDataUnsafe?.start_param) {
    return app.initDataUnsafe.start_param;
  }
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("startapp") || url.searchParams.get("tgWebAppStartParam");
  } catch {
    return null;
  }
}

/** Translate Telegram Mini App deep-link start_param into internal KhLan SPA View */
export function parseTmaDeepLink(startParam: string | null): View | null {
  if (!startParam) return null;
  const param = startParam.trim();

  // vehicle_<id> or veh_<id>
  if (param.startsWith("vehicle_") || param.startsWith("veh_") || param.startsWith("part_")) {
    const vehicleId = param.startsWith("vehicle_") ? param.replace("vehicle_", "") : param;
    return { name: "detail", vehicleId };
  }

  // seller_<id> or usr_<id>
  if (param.startsWith("seller_") || param.startsWith("usr_")) {
    const userId = param.startsWith("seller_") ? param.replace("seller_", "") : param;
    return { name: "seller", userId };
  }

  // report_<id>
  if (param.startsWith("report_")) {
    const vehicleId = param.replace("report_", "");
    return { name: "report", vehicleId };
  }

  // browse_<query>
  if (param.startsWith("browse_")) {
    const q = decodeURIComponent(param.replace("browse_", ""));
    return { name: "browse", q };
  }

  return null;
}

// ---------- Native Telegram Share ----------

export function tgShareListing(opts: {
  id: string;
  title: string;
  priceUsd: number;
  category?: string;
  origin?: string;
}): void {
  const origin = opts.origin || (typeof window !== "undefined" ? window.location.origin : "");
  const directLink = `${origin}/?startapp=vehicle_${opts.id}`;
  const text = `🚗 ${opts.title} - $${opts.priceUsd.toLocaleString()}\nView verified listing & AI report on KhLan:`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(directLink)}&text=${encodeURIComponent(text)}`;

  const app = tg();
  if (app && typeof app.openTelegramLink === "function") {
    try {
      app.openTelegramLink(shareUrl);
      return;
    } catch {
      /* fallback */
    }
  }

  if (typeof window !== "undefined") {
    window.open(shareUrl, "_blank");
  }
}
