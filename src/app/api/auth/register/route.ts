import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE, createSessionToken, hashPassword, normalizeKhmerPhone, sessionCookieOptions } from "@/lib/auth";
import { consumeCaptchaToken } from "@/lib/captcha";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  // loose on the wire — normalizeKhmerPhone canonicalizes (012…, 855…, +855…)
  phone: z.string().min(6).max(32),
  password: z.string().min(8, "password must be at least 8 characters").max(128),
  // Self-selected account type. Staff roles (ADMIN / SUPER_ADMIN) can NEVER be
  // created through public registration — they are provisioned internally only.
  role: z.enum(["BUYER", "SELLER", "DEALER"]).default("BUYER"),
  locale: z.enum(["en", "km", "zh", "vi"]).optional(),
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
    const { name, password, locale, role } = parsed.data;
    const phone = normalizeKhmerPhone(parsed.data.phone);
    if (!phone) {
      return NextResponse.json(
        { error: "phone: must be a Cambodian number like +85512345678" },
        { status: 400 },
      );
    }

    // Security Verification first — every registration attempt needs a fresh captcha.
    if (!consumeCaptchaToken(parsed.data.captchaToken)) {
      return NextResponse.json(
        { error: "Captcha verification failed or expired — please complete the security verification again" },
        { status: 400 },
      );
    }

    const { readPlatformSettings } = await import("@/lib/platform-settings");
    const settings = await readPlatformSettings();
    if (settings.adminOnlyLogin) {
      return NextResponse.json(
        { error: "Public registration is currently disabled while platform is in administrator-only mode" },
        { status: 403 },
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
        role,
        locale: locale ?? "km",
        phoneVerified: false,
      },
    });
    // Every account gets a seller profile lazily; sellers/dealers get the
    // matching profile type so their future listings are attributed correctly.
    await db.sellerProfile.create({
      data: { userId: user.id, type: role === "DEALER" ? "DEALER" : "PRIVATE" },
    });

    const isSellerOrDealer = role === "SELLER" || role === "DEALER";
    let isTrialActive = false;

    if (isSellerOrDealer) {
      const { readPlatformSettings } = await import("@/lib/platform-settings");
      const settings = await readPlatformSettings();
      isTrialActive = Boolean(settings.freeTrialEnabled && settings.freeTrialDays > 0);
      const trialEnd = new Date(Date.now() + (isTrialActive ? settings.freeTrialDays : 0) * 86400000);

      const randomSuffix = Math.random().toString(36).slice(2, 7);
      const cleanSlug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "store"}-${randomSuffix}`;

      const tenant = await db.tenant.create({
        data: {
          name: role === "DEALER" ? `${name}'s Dealership` : `${name} (Seller)`,
          slug: cleanSlug,
          phone,
          status: "ACTIVE",
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
          subscription: {
            create: {
              plan: "FREE",
              status: isTrialActive ? "ACTIVE" : "PAST_DUE",
              billingCycle: "MONTHLY",
              priceUsd: 0,
              listingsLimit: isTrialActive ? 15 : 0,
              featuredLimit: isTrialActive ? 3 : 0,
              seats: role === "DEALER" ? 3 : 1,
              startedAt: new Date(),
              currentPeriodEnd: trialEnd,
            },
          },
        },
      });

      await db.sellerProfile.update({
        where: { userId: user.id },
        data: { tenantId: tenant.id },
      });
    }

    const token = createSessionToken(user.id);
    const res = NextResponse.json(
      {
        ok: true,
        user: { id: user.id, name: user.name, role: user.role, locale: user.locale },
        // Cookie-blocked browsers keep this token in localStorage and send it
        // via the x-khlan-session header instead.
        sessionToken: token,
        freeTrialActive: isTrialActive,
        requiresSubscription: isSellerOrDealer && !isTrialActive,
      },
      { status: 201 },
    );
    res.cookies.set({ name: AUTH_COOKIE, value: token, ...await sessionCookieOptions() });
    return res;
  } catch (err) {
    console.error("[api/auth/register] failed:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
