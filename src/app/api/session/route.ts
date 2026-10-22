import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE } from "@/lib/auth";
import { ensureDefaultSuperAdmin } from "@/lib/bootstrap";
import {
  ALLOWED_PERSONA_IDS,
  PERSONA_COOKIE,
  getActivePersonaId,
  getCurrentUser,
} from "@/lib/session";
import { readPlatformSettings, sellerTrialWindow } from "@/lib/platform-settings";
import type { PersonaDTO, SessionDTO, TenantRole, UserRole } from "@/lib/dashboard-types";
import type { SellerType } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Bilingual (now quadri-lingual, Task 19) switcher labels per persona id. */
const PERSONA_META: Record<
  string,
  { label: Record<Locale, string>; tag: PersonaDTO["tag"] }
> = {
  usr_demo_buyer: {
    label: { en: "Buyer — Dara", km: "អ្នកទិញ — ដារា", zh: "买家 — Dara", vi: "Người mua — Dara" },
    tag: "buyer",
  },
  usr_dealer_sokha: {
    label: { en: "Dealer Owner — Sokha", km: "ម្ចាស់ក្សេត្រ — សុខា", zh: "经销商老板 — Sokha", vi: "Chủ đại lý — Sokha" },
    tag: "dealer-owner",
  },
  usr_staff_chan: {
    label: { en: "Sales Staff — Chan", km: "បុគ្គលិកលក់ — ចាន់", zh: "销售人员 — Chan", vi: "Nhân viên bán hàng — Chan" },
    tag: "sales-staff",
  },
  usr_staff_sophea: {
    label: { en: "Inventory Manager — Sophea", km: "អ្នកគ្រប់គ្រងការផ្ទុក — សុភា", zh: "库存经理 — Sophea", vi: "Quản lý kho xe — Sophea" },
    tag: "inventory-manager",
  },
  usr_dealer_ppauto: {
    label: { en: "Dealer Owner — PP Auto", km: "ម្ចាស់ក្សេត្រ — ភីភី អូតូ", zh: "经销商老板 — PP Auto", vi: "Chủ đại lý — PP Auto" },
    tag: "dealer-owner",
  },
  usr_priv_vireak: {
    label: { en: "Private Seller — Vireak", km: "អ្នកលក់ឯកជន — វីរៈ", zh: "个人卖家 — Vireak", vi: "Người bán cá nhân — Vireak" },
    tag: "private-seller",
  },
  usr_priv_sopheak: {
    label: { en: "Private Seller — Sopheak", km: "អ្នកលក់ឯកជន — សុភ័ក្ត្រ", zh: "个人卖家 — Sopheak", vi: "Người bán cá nhân — Sopheak" },
    tag: "private-seller",
  },
  usr_admin: {
    label: { en: "Super Admin — Nita", km: "អ្នកគ្រប់គ្រងកំពូល — នីតា", zh: "超级管理员 — Nita", vi: "Quản trị viên cấp cao — Nita" },
    tag: "admin",
  },
};

async function buildSessionFor(userId: string): Promise<SessionDTO> {
  const [user, membership, personaUsers] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, include: { sellerProfile: true } }),
    db.tenantMember.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { tenant: { include: { subscription: true } } },
    }),
    db.user.findMany({ where: { id: { in: [...ALLOWED_PERSONA_IDS] } } }),
  ]);

  const byId = new Map(personaUsers.map((u) => [u.id, u]));
  const personas: PersonaDTO[] = [...ALLOWED_PERSONA_IDS].flatMap((id) => {
    const u = byId.get(id);
    const meta = PERSONA_META[id];
    if (!u || !meta) return [];
    return [
      {
        id: u.id,
        name: u.name,
        role: u.role as UserRole,
        label: meta.label,
        tag: meta.tag,
      },
    ];
  });

  if (!user) {
    // Defensive: persona validated upstream, but keep a safe empty shape.
    return {
      user: { id: "", name: "", role: "BUYER", locale: "km", avatarUrl: null, phone: "" },
      sellerType: null,
      tenant: null,
      authed: false,
      telegramLinked: false,
      personas,
    };
  }

  const sellerType: SellerType | null = user.sellerProfile
    ? user.sellerProfile.type === "DEALER"
      ? "DEALER"
      : "PRIVATE"
    : null;

  const authed = await isAuthedUser(user.id);

  let subscription: SessionDTO["subscription"] = null;
  if (user.role === "SELLER" || user.role === "DEALER") {
    const settings = await readPlatformSettings();
    const realSub = membership?.tenant?.subscription;
    if (realSub && realSub.status === "ACTIVE" && realSub.plan !== "FREE") {
      subscription = {
        plan: realSub.plan,
        status: "ACTIVE",
        isTrial: false,
        currentPeriodEnd: realSub.currentPeriodEnd.toISOString(),
      };
    } else {
      const trial = sellerTrialWindow(user.createdAt, settings.freeTrialDays, settings.freeTrialEnabled);
      subscription = {
        plan: "FREE_TRIAL",
        status: trial.enabled && !trial.expired ? "ACTIVE" : "EXPIRED",
        isTrial: true,
        currentPeriodEnd: trial.currentPeriodEnd.toISOString(),
      };
    }
  }

  const session: SessionDTO = {
    user: {
      id: user.id,
      name: user.name,
      role: user.role as UserRole,
      locale: user.locale,
      avatarUrl: user.avatarUrl ?? null,
      phone: user.phone,
    },
    sellerType,
    tenant: membership
      ? {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          logoUrl: membership.tenant.logoUrl ?? null,
          myRole: membership.role as TenantRole,
        }
      : null,
    authed,
    telegramLinked: Boolean(user.telegramId),
    phoneVerified: user.phoneVerified,
    personas,
    subscription,
  };
  return session;
}

/** True when the given user id holds a valid `khlan_auth` session (cookie OR
 *  the `x-khlan-session` header used by cookie-blocked browsers). */
async function isAuthedUser(userId: string): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const { verifySessionToken, AUTH_COOKIE, SESSION_HEADER } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const jar = await cookies();
  if (verifySessionToken(jar.get(AUTH_COOKIE)?.value) === userId) return true;
  const h = await headers();
  return verifySessionToken(h.get(SESSION_HEADER)) === userId;
}

export async function GET() {
  try {
    // Fresh-database guarantee: the platform always ships a Super Admin.
    await ensureDefaultSuperAdmin();

    const current = await getCurrentUser();
    const session = await buildSessionFor(current.id);

    // Distinguish a genuine guest (fresh visitor, no session info) from an
    // active demo persona (sandbox impersonation via cookie OR header):
    // guests get the public experience and are asked to register before
    // contacting dealers; demo personas keep full sandbox access.
    const personaActive = await getActivePersonaId();
    const demoPersona = !session.authed && Boolean(personaActive);
    const res = NextResponse.json({ ...session, demoPersona });

    // Stale-session cleanup: when the browser still carries `khlan_auth` but
    // it no longer verifies (database reseeded, token expired, secret rotated),
    // silently falling back to the demo buyer used to masquerade as a "login"
    // that had no admin tools. Clear the dead cookie so the visitor becomes a
    // real guest and the UI shows Log in / Sign up instead. Header-based
    // sessions (cookie-blocked browsers) have no stale cookie to clear.
    const jar = await cookies();
    if (!session.authed && !demoPersona && jar.get(AUTH_COOKIE)?.value) {
      res.cookies.set({ name: AUTH_COOKIE, value: "", path: "/", maxAge: 0 });
    }
    return res;
  } catch (err) {
    console.error("[api/session] GET failed:", err);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

const switchSchema = z.object({ userId: z.enum(ALLOWED_PERSONA_IDS) });

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = switchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "userId must be one of the allowed demo personas" },
        { status: 400 },
      );
    }

    const target = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!target) {
      return NextResponse.json({ error: "Persona user not found" }, { status: 404 });
    }

    const res = NextResponse.json(await buildSessionFor(target.id));
    res.cookies.set({
      name: PERSONA_COOKIE,
      value: target.id,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    // Leaving the real account: persona switching is demo-only, so clear any
    // auth session to keep "who am I" unambiguous.
    res.cookies.delete({ name: AUTH_COOKIE, path: "/" });
    return res;
  } catch (err) {
    console.error("[api/session] POST failed:", err);
    return NextResponse.json({ error: "Failed to switch persona" }, { status: 500 });
  }
}
