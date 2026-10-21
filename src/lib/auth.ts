// KhLan auth core — password hashing (scrypt), signed session tokens (HMAC),
// and Telegram Mini App initData validation.
// Session resolution order (see src/lib/session.ts):
//   1. `khlan_auth` cookie  → real logged-in user
//   2. `khlan_persona` cookie → demo persona impersonation
//   3. demo buyer fallback
// OTP login/verification has been removed by product decision — the only
// sign-in paths are password login, registration and Telegram.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

export const AUTH_COOKIE = "khlan_auth";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Fallback transport for environments where cookies are blocked (embedded
 *  previews, strict third-party-cookie settings): the client stores the SAME
 *  signed token in localStorage and sends it via these request headers. */
export const SESSION_HEADER = "x-khlan-session";
export const PERSONA_HEADER = "x-khlan-persona";
/** Client localStorage keys (mirrored in client-hooks.ts / auth-view.tsx). */
export const LS_TOKEN_KEY = "khlan_ls_token";
export const LS_PERSONA_KEY = "khlan_ls_persona";

const SECRET = process.env.AUTH_SECRET || "khlan-dev-secret-change-me";

// ---------- Passwords ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  try {
    const check = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return expected.length === check.length && crypto.timingSafeEqual(expected, check);
  } catch {
    return false;
  }
}

/**
 * Normalize Cambodian phone input to the canonical `+855XXXXXXXX` form used
 * for User.phone. Accepts 0-prefixed local numbers (012998009), bare 8–9 digit
 * numbers (12998009) and 855-prefixed numbers (85512998009), ignoring spaces,
 * dashes, dots and parentheses. Returns null when nothing matches.
 */
export function normalizeKhmerPhone(raw: string): string | null {
  const d = raw.replace(/[\s\-().]/g, "");
  if (/^\+855\d{7,9}$/.test(d)) return d;
  if (/^855\d{7,9}$/.test(d)) return `+855${d.slice(3)}`;
  if (/^0\d{8,9}$/.test(d)) return `+855${d.slice(1)}`;
  if (/^\d{7,9}$/.test(d)) return `+855${d}`;
  return null;
}

// ---------- Signed session tokens ----------

export function createSessionToken(userId: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${userId}.${expRaw}`).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

// ---------- Cookies (route handlers only) ----------

/**
 * Session cookie options. Inside HTTPS-embedded contexts (preview panels)
 * `SameSite=Lax` cookies are refused outright — switch to `SameSite=None;
 * Secure` when the request arrived over HTTPS so the cookie can be set in
 * cross-site frames. Plain-HTTP access keeps Lax (None+Secure is rejected
 * on insecure origins).
 */
export async function sessionCookieOptions() {
  let https = false;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    https = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  } catch {
    /* outside request scope — default below */
  }
  return {
    httpOnly: true as const,
    sameSite: (https ? "none" : "lax") as "none" | "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

/**
 * The real logged-in user, or null when only demo/persona mode is active.
 * Resolution: `khlan_auth` cookie first, then the `x-khlan-session` header
 * (cookie-blocked browsers carry the same signed token in localStorage and
 * attach it to every API call from the client fetch wrapper).
 */
export async function getAuthUser(): Promise<User | null> {
  let token: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(AUTH_COOKIE)?.value;
  } catch {
    token = undefined;
  }
  if (!token || !verifySessionToken(token)) {
    // Cookie missing/invalid → try the session header fallback.
    try {
      const { headers } = await import("next/headers");
      const h = await headers();
      token = h.get(SESSION_HEADER) ?? undefined;
    } catch {
      return null;
    }
  }
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  return user ?? null;
}

// ---------- Telegram Mini App ----------

export interface TelegramAuthResult {
  ok: boolean;
  mode: "validated" | "demo";
  user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string } | null;
  error?: string;
}

/**
 * Validate Telegram WebApp initData (HMAC-SHA256 per Telegram spec).
 * With TELEGRAM_BOT_TOKEN set → full cryptographic validation.
 * Without a token (sandbox/demo) → parse-only "demo" mode, clearly flagged.
 */
export function validateTelegramInitData(initData: string): TelegramAuthResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, mode: "demo", error: "Malformed initData" };
  }

  const hash = params.get("hash") ?? "";
  const rawUser = params.get("user");
  let tgUser: TelegramAuthResult["user"] = null;
  if (rawUser) {
    try {
      tgUser = JSON.parse(rawUser);
    } catch {
      tgUser = null;
    }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    // Demo mode — no cryptographic validation possible in the sandbox.
    if (!tgUser || typeof tgUser.id !== "number") {
      return { ok: false, mode: "demo", error: "initData is missing a usable user payload" };
    }
    return { ok: true, mode: "demo", user: tgUser };
  }

  if (!hash) return { ok: false, mode: "validated", error: "initData is missing hash" };
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, mode: "validated", error: "initData signature verification failed" };
  }
  // Reject replays older than 24h.
  const authDate = Number(params.get("auth_date") ?? 0) * 1000;
  if (authDate && Date.now() - authDate > 24 * 60 * 60 * 1000) {
    return { ok: false, mode: "validated", error: "initData is expired" };
  }
  return { ok: true, mode: "validated", user: tgUser };
}
