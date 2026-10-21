// KhLan Telegram Mini App support (Task 6-a).
// Feature-detected everywhere: when the app runs outside Telegram (or the
// telegram-web-app.js script failed to load, e.g. offline sandbox) every
// helper degrades to a safe no-op / false, so the normal web look is intact.

// ---------- minimal types (loose — no `any` leaks into components) ----------

export interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

export interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgHapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string; photo_url?: string } };
  version?: string;
  colorScheme?: "light" | "dark";
  themeParams?: TgThemeParams;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  HapticFeedback?: TgHapticFeedback;
  BackButton?: TgBackButton;
}

interface TelegramWindow {
  Telegram?: { WebApp?: TgWebApp };
}

// ---------- accessors ----------

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

// ---------- init ----------

/**
 * One-time Mini App setup: ready(), expand(), dark header, and theme bridging
 * onto CSS variables (--tg-bg / --tg-text / --tg-hint / --tg-button /
 * --tg-button-text) so components can adopt Telegram colors when present.
 * Resolves with whether real initData is available (i.e. logged context).
 */
export async function initTelegram(): Promise<{ linked: boolean }> {
  if (typeof window === "undefined") return { linked: false };
  const app = tg();
  if (!app) return { linked: false };
  try {
    app.ready();
    app.expand();
    app.setHeaderColor("#020617"); // slate-950 — matches the KhLan header
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

// ---------- auth handshake ----------

let tgAuthSent = false; // module-level: send the handshake once per page load

/**
 * POST /api/auth/telegram with the real initData (once per page load).
 * Returns true when the backend created an auth session (page should reload
 * so SessionBoot picks it up).
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

// ---------- haptics ----------

/** Safe haptic wrapper — no-op outside Telegram or on unsupported clients. */
export function tgHaptic(type: "light" | "medium" | "heavy" | "rigid" | "soft" = "light"): void {
  try {
    tg()?.HapticFeedback?.impactOccurred(type);
  } catch {
    /* ignore */
  }
}

// ---------- back button ----------

export interface TgBackButtonHandle {
  show(): void;
  hide(): void;
}

/**
 * Wire the native Telegram BackButton to a callback. Returns a handle with
 * show()/hide(), or null when there is no BackButton (plain browser).
 */
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
