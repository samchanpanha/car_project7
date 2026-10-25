import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import {
  AUTH_COOKIE,
  PERSONA_HEADER,
  SESSION_HEADER,
  getAuthUser,
  verifySessionToken,
} from "@/lib/auth";
import type { User, SellerProfile } from "@prisma/client";

export const DEMO_BUYER_ID = "usr_demo_buyer";
export const DEMO_BUYER_PHONE = "+85511998877";

/** Cookie that stores the active demo persona id (see POST /api/session). */
export const PERSONA_COOKIE = "khlan_persona";

/** The 8 demo personas that the session switcher may activate. */
export const ALLOWED_PERSONA_IDS = [
  "usr_demo_buyer",
  "usr_dealer_sokha",
  "usr_staff_chan",
  "usr_staff_sophea",
  "usr_dealer_ppauto",
  "usr_priv_vireak",
  "usr_priv_sopheak",
  "usr_admin",
] as const;

export type DemoUser = User & { sellerProfile: SellerProfile | null };

/**
 * Resolve the demo buyer user for MVP flows:
 * 1. by fixed id `usr_demo_buyer`
 * 2. by phone `+85511998877`
 * 3. create it (id "usr_demo_buyer", phone "+85511998877", name "Dara Sok",
 *    role BUYER, locale km, phoneVerified true) + a PRIVATE SellerProfile.
 */
export async function getDemoUser(): Promise<DemoUser> {
  let user = await db.user.findUnique({
    where: { id: DEMO_BUYER_ID },
    include: { sellerProfile: true },
  });

  if (!user) {
    user = await db.user.findUnique({
      where: { phone: DEMO_BUYER_PHONE },
      include: { sellerProfile: true },
    });
  }

  if (!user) {
    user = await db.user.create({
      data: {
        id: DEMO_BUYER_ID,
        phone: DEMO_BUYER_PHONE,
        name: "Dara Sok",
        role: "BUYER",
        locale: "km",
        phoneVerified: true,
      },
      include: { sellerProfile: true },
    });
  }

  if (!user.sellerProfile) {
    // Concurrent boot requests can race here — whoever loses the unique
    // constraint must re-read the profile the winner just created instead of
    // failing the whole /api/session call with a P2002 500.
    try {
      const profile = await db.sellerProfile.create({
        data: { userId: user.id, type: "PRIVATE" },
      });
      user = { ...user, sellerProfile: profile };
    } catch {
      const existing = await db.sellerProfile.findUnique({
        where: { userId: user.id },
      });
      if (existing) user = { ...user, sellerProfile: existing };
    }
  }

  return user;
}

/** Read a cookie value (empty string when absent / outside request scope). */
async function readCookie(name: string): Promise<string> {
  try {
    const store = await cookies();
    return store.get(name)?.value ?? "";
  } catch {
    return "";
  }
}

/** Read a request header value (empty string when absent). */
async function readHeader(name: string): Promise<string> {
  try {
    const h = await headers();
    return h.get(name) ?? "";
  } catch {
    return "";
  }
}

/**
 * The active demo persona id (cookie first, then the `x-khlan-persona`
 * header used by cookie-blocked browsers), or null.
 */
export async function getActivePersonaId(): Promise<string | null> {
  const cookieVal = await readCookie(PERSONA_COOKIE);
  if (cookieVal && (ALLOWED_PERSONA_IDS as readonly string[]).includes(cookieVal)) {
    return cookieVal;
  }
  const headerVal = await readHeader(PERSONA_HEADER);
  if (headerVal && (ALLOWED_PERSONA_IDS as readonly string[]).includes(headerVal)) {
    return headerVal;
  }
  return null;
}

/**
 * True when the caller is a genuine guest: no real auth session AND no demo
 * persona — via cookie OR header (cookie-blocked browsers carry the same
 * values in localStorage-backed headers). Guests get the public experience —
 * account actions (favorites, conversations, purchases) must not silently
 * attach to the fallback demo buyer. The auth cookie/header must carry a
 * VALID signed token — a stale/expired one counts as no auth at all.
 */
export async function isGuestRequest(): Promise<boolean> {
  const authCookie = await readCookie(AUTH_COOKIE);
  if (authCookie && verifySessionToken(authCookie)) return false;
  const authHeader = await readHeader(SESSION_HEADER);
  if (authHeader && verifySessionToken(authHeader)) return false;

  const { readPlatformSettings } = await import("@/lib/platform-settings");
  const settings = await readPlatformSettings();
  if (!settings.demoModeEnabled) return true;

  const persona = await getActivePersonaId();
  return !persona;
}

/**
 * Resolve the current user with this priority:
 * 1. real auth session (`khlan_auth` cookie — login/register/Telegram)
 * 2. demo persona (`khlan_persona` cookie — sandbox impersonation, only if demoModeEnabled)
 * 3. demo buyer fallback
 * The sellerProfile may be null for staff personas — no auto-create, to keep
 * the seeded DB clean.
 */
export async function getCurrentUser(): Promise<DemoUser> {
  // 1. Real auth session wins over the demo persona (cookie OR header token).
  const authUser = await getAuthUser();
  if (authUser) {
    const profile = await db.sellerProfile.findUnique({ where: { userId: authUser.id } });
    return { ...authUser, sellerProfile: profile };
  }

  // 2. Demo persona (cookie, then header fallback, only when demo mode is enabled).
  const { readPlatformSettings } = await import("@/lib/platform-settings");
  const settings = await readPlatformSettings();
  if (settings.demoModeEnabled) {
    const personaId = await getActivePersonaId();
    if (personaId) {
      const user = await db.user.findUnique({
        where: { id: personaId },
        include: { sellerProfile: true },
      });
      if (user) return user;
    }
  }

  // 3. Demo buyer fallback.
  return getDemoUser();
}
