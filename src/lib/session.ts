import { cookies } from "next/headers";
import { db } from "@/lib/db";
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
    const profile = await db.sellerProfile.create({
      data: { userId: user.id, type: "PRIVATE" },
    });
    user = { ...user, sellerProfile: profile };
  }

  return user;
}

/**
 * Resolve the current user from the `khlan_persona` cookie:
 * - cookie present + id in ALLOWED_PERSONA_IDS + user exists → that user
 *   (sellerProfile may be null for staff personas — no auto-create, to keep
 *   the seeded DB clean)
 * - otherwise → demo buyer (identical behavior to before personas existed).
 */
export async function getCurrentUser(): Promise<DemoUser> {
  let personaId: string | undefined;
  try {
    const store = await cookies();
    personaId = store.get(PERSONA_COOKIE)?.value;
  } catch {
    personaId = undefined; // outside request scope — fall back to demo buyer
  }

  if (personaId && (ALLOWED_PERSONA_IDS as readonly string[]).includes(personaId)) {
    const user = await db.user.findUnique({
      where: { id: personaId },
      include: { sellerProfile: true },
    });
    if (user) return user;
  }

  return getDemoUser();
}
