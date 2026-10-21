import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE, createSessionToken, hashPassword, sessionCookieOptions } from "@/lib/auth";
import { consumeCaptchaToken } from "@/lib/captcha";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^\+855\d{7,9}$/, "phone must be a Cambodian number like +85512345678"),
  password: z.string().min(8, "password must be at least 8 characters").max(128),
  locale: z.enum(["en", "km"]).optional(),
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

    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    const { name, phone, password, locale } = parsed.data;

    // Security Verification first — every registration attempt needs a fresh captcha.
    if (!consumeCaptchaToken(parsed.data.captchaToken)) {
      return NextResponse.json(
        { error: "Captcha verification failed or expired — please complete the security verification again" },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { error: "This phone number is already registered — please log in" },
        { status: 400 },
      );
    }

    const user = await db.user.create({
      data: {
        name,
        phone,
        passwordHash: hashPassword(password),
        role: "BUYER",
        locale: locale ?? "km",
        phoneVerified: false,
      },
    });
    // Private sellers get a profile lazily; give every new account one.
    await db.sellerProfile.create({ data: { userId: user.id, type: "PRIVATE" } });

    const res = NextResponse.json(
      {
        ok: true,
        user: { id: user.id, name: user.name, role: user.role, locale: user.locale },
      },
      { status: 201 },
    );
    res.cookies.set({ name: AUTH_COOKIE, value: createSessionToken(user.id), ...sessionCookieOptions() });
    return res;
  } catch (err) {
    console.error("[api/auth/register] failed:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
