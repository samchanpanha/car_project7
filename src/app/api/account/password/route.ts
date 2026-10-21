import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, "password must be at least 8 characters").max(128),
});

/** Change password — works even when the account has no password yet (Telegram/OTP-only). */
export async function POST(req: Request) {
  try {
    const me = await getAuthUser();
    if (!me) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = passwordSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    // Accounts without a password (Telegram/OTP-only) may set one without a current password.
    if (me.passwordHash && !verifyPassword(parsed.data.currentPassword, me.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    await db.user.update({
      where: { id: me.id },
      data: { passwordHash: hashPassword(parsed.data.newPassword) },
    });

    await db.auditLog.create({
      data: {
        actorId: me.id,
        action: "PASSWORD_CHANGED",
        entity: "User",
        entityId: me.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/account/password] failed:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
