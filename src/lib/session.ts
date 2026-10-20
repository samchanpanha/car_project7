import { db } from "@/lib/db";
import type { User, SellerProfile } from "@prisma/client";

export const DEMO_BUYER_ID = "usr_demo_buyer";
export const DEMO_BUYER_PHONE = "+85511998877";

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
