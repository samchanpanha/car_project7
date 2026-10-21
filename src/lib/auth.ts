// KhLan auth core — password hashing (scrypt), signed session tokens (HMAC),
// OTP hashing, and Telegram Mini App initData validation.
// Session resolution order (see src/lib/session.ts):
//   1. `khlan_auth` cookie  → real logged-in user
//   2. `khlan_persona` cookie → demo persona impersonation
//   3. demo buyer fallback

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

export const AUTH_COOKIE = "khlan_auth";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

/** The real logged-in user, or null when only demo/persona mode is active. */
export async function getAuthUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  return user ?? null;
}

// ---------- OTP ----------

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(code: string): string {
  return crypto.createHmac("sha256", SECRET).update(`otp:${code}`).digest("hex");
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
