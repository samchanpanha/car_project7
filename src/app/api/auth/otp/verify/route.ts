import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  AUTH_COOKIE,
  createSessionToken,
  hashOtpCode,
  sessionCookieOptions,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  phone: z.string().regex(/^\+855\d{7,9}$/),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
  purpose: z.enum(["LOGIN", "VERIFY"]),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = verifySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { phone, code, purpose } = parsed.data;

    const otp = await db.otpCode.findFirst({
      where: {
        phone,
        purpose,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp || otp.codeHash !== hashOtpCode(code)) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    await db.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

    if (purpose === "VERIFY") {
      // Mark phone verified for the logged-in user who owns this phone.
      const { getAuthUser } = await import("@/lib/auth");
      const me = await getAuthUser();
      if (!me || me.phone !== phone) {
        return NextResponse.json({ error: "Session does not match this phone" }, { status: 403 });
      }
      await db.user.update({ where: { id: me.id }, data: { phoneVerified: true } });
      return NextResponse.json({ ok: true, phoneVerified: true });
    }

    // LOGIN: passwordless sign-in for an existing account.
    const user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      return NextResponse.json(
        { error: "No account with this phone — please register first" },
        { status: 404 },
      );
    }

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role, locale: user.locale },
    });
    res.cookies.set({ name: AUTH_COOKIE, value: createSessionToken(user.id), ...sessionCookieOptions() });
    res.cookies.delete({ name: "khlan_persona", path: "/" });
    return res;
  } catch (err) {
    console.error("[api/auth/otp/verify] failed:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
