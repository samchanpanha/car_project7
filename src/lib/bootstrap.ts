// One-time per-process bootstrap guarantees for fresh databases.
// ensureDefaultSuperAdmin() makes sure the platform always has a working
// Super Admin account out of the box (the user's request: "create a user
// super admin for me by default").

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const DEFAULT_SUPER_ADMIN = {
  id: "usr_admin",
  phone: "+85512998009",
  name: "Nita Meng",
  password: "khlan123",
} as const;

let ensured = false;

/**
 * Idempotently guarantee the default Super Admin exists:
 *  - create `usr_admin` when missing (with the default password), or
 *  - repair role/password when the account exists but was left unusable.
 * A real user already holding the default phone (different id) is never
 * touched — no account takeover.
 */
export async function ensureDefaultSuperAdmin(): Promise<void> {
  if (ensured) return;
  try {
    const existing = await db.user.findUnique({ where: { id: DEFAULT_SUPER_ADMIN.id } });
    if (!existing) {
      const phoneOwner = await db.user.findUnique({
        where: { phone: DEFAULT_SUPER_ADMIN.phone },
        select: { id: true },
      });
      if (!phoneOwner) {
        await db.user.create({
          data: {
            id: DEFAULT_SUPER_ADMIN.id,
            phone: DEFAULT_SUPER_ADMIN.phone,
            name: DEFAULT_SUPER_ADMIN.name,
            role: "SUPER_ADMIN",
            locale: "en",
            phoneVerified: true,
            passwordHash: hashPassword(DEFAULT_SUPER_ADMIN.password),
          },
        });
        console.log("[bootstrap] default super admin created:", DEFAULT_SUPER_ADMIN.phone);
      }
    } else if (existing.role !== "SUPER_ADMIN" || !existing.passwordHash) {
      await db.user.update({
        where: { id: DEFAULT_SUPER_ADMIN.id },
        data: {
          role: "SUPER_ADMIN",
          ...(existing.passwordHash ? {} : { passwordHash: hashPassword(DEFAULT_SUPER_ADMIN.password) }),
        },
      });
    }
    ensured = true;
  } catch (err) {
    // Never break the caller (session boot) — retry on the next request.
    ensured = false;
    console.error("[bootstrap] ensureDefaultSuperAdmin failed:", err);
  }
}
