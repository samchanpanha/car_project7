import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE, createSessionToken, normalizeKhmerPhone, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { consumeCaptchaToken } from "@/lib/captcha";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  // loose on the wire — normalizeKhmerPhone canonicalizes (012…, 855…, +855…)
  phone: z.string().min(6).max(32),
  password: z.string().min(1).max(128),
  /** single-use token minted by POST /api/auth/captcha/verify */
  captchaToken: z.string().min(20).max(256),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { password } = parsed.data;
    const phone = normalizeKhmerPhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json(
        { error: "phone: must be a Cambodian number like +85512345678" },
        { status: 400 },
      );
    }

    // Security Verification first — every login attempt needs a fresh captcha.
    if (!consumeCaptchaToken(parsed.data.captchaToken)) {
      return NextResponse.json(
        { error: "Captcha verification failed or expired — please complete the security verification again" },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({ where: { phone } });
    // Same message for unknown phone and wrong password — no account enumeration.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Incorrect phone number or password" }, { status: 401 });
    }

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role, locale: user.locale },
    });
    res.cookies.set({ name: AUTH_COOKIE, value: createSessionToken(user.id), ...sessionCookieOptions() });
    // A real login supersedes the demo persona.
    res.cookies.delete({ name: "khlan_persona", path: "/" });
    return res;
  } catch (err) {
    console.error("[api/auth/login] failed:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
