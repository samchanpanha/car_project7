import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE, SESSION_HEADER, verifySessionToken } from "@/lib/auth";
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

/** Bilingual switcher labels per persona id. */
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

/** True when the given user id holds a valid auth session (cookie OR header token). */
async function isAuthedUser(userId: string): Promise<boolean> {
  try {
    const jar = await cookies();
    const authVal = jar.get(AUTH_COOKIE)?.value;
    if (authVal && verifySessionToken(authVal) === userId) return true;
    const h = await headers();
    const headVal = h.get(SESSION_HEADER);
    return Boolean(headVal && verifySessionToken(headVal) === userId);
  } catch {
    return false;
  }
}

async function buildSessionFor(userId: string): Promise<SessionDTO> {
  const [user, membership, personaUsers, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, include: { sellerProfile: true } }),
    db.tenantMember.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { tenant: { include: { subscription: true } } },
    }),
    db.user.findMany({ where: { id: { in: [...ALLOWED_PERSONA_IDS] } } }),
    readPlatformSettings(),
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
    return {
      user: { id: "", name: "", role: "BUYER", locale: "km", avatarUrl: null, phone: "" },
      sellerType: null,
      tenant: null,
      authed: false,
      telegramLinked: false,
      personas,
      subscription: null,
      demoModeEnabled: settings.demoModeEnabled,
      adminOnlyLogin: settings.adminOnlyLogin,
    };
  }

  const sellerType: SellerType | null = user.sellerProfile
    ? user.sellerProfile.type === "DEALER"
      ? "DEALER"
      : "PRIVATE"
    : null;

  const authed = await isAuthedUser(user.id);

  let subscription: SessionDTO["subscription"] = null;
  const isDealerOrSeller = user.role === "SELLER" || user.role === "DEALER";

  if (isDealerOrSeller) {
    const realSub = membership?.tenant?.subscription;
    if (membership && realSub) {
      const isActive = realSub.status === "ACTIVE";
      subscription = {
        plan: realSub.plan,
        status: isActive ? "ACTIVE" : "EXPIRED",
        isTrial: false,
        currentPeriodEnd: realSub.currentPeriodEnd.toISOString(),
      };
    } else if (settings.demoModeEnabled || (ALLOWED_PERSONA_IDS as readonly string[]).includes(user.id)) {
      // In demo mode or for demo personas: grant ACTIVE trial/plan so testing pricing & leads is frictionless
      subscription = {
        plan: user.role === "DEALER" ? "DEALER_PRO" : "SELLER_PRO",
        status: "ACTIVE",
        isTrial: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
      locale: user.locale ?? "km",
      avatarUrl: user.avatarUrl ?? null,
      phone: user.phone,
    },
    sellerType,
    tenant: membership?.tenant
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
    phoneVerified: Boolean(user.phoneVerified),
    personas: settings.demoModeEnabled
      ? personas
      : authed && (user.role === "SUPER_ADMIN" || user.role === "ADMIN")
        ? personas
        : [],
    subscription,
    demoModeEnabled: settings.demoModeEnabled,
    adminOnlyLogin: settings.adminOnlyLogin,
  };
  return session;
}

export async function GET() {
  try {
    await ensureDefaultSuperAdmin();

    const current = await getCurrentUser();
    const session = await buildSessionFor(current.id);

    const settings = await readPlatformSettings();
    const personaActive = settings.demoModeEnabled ? await getActivePersonaId() : null;
    const demoPersona = !session.authed && Boolean(personaActive);
    const res = NextResponse.json({ ...session, demoPersona });

    if (!settings.demoModeEnabled && !session.authed) {
      res.cookies.set({ name: PERSONA_COOKIE, value: "", path: "/", maxAge: 0 });
    }

    try {
      const jar = await cookies();
      if (!session.authed && !demoPersona && jar.get(AUTH_COOKIE)?.value) {
        res.cookies.set({ name: AUTH_COOKIE, value: "", path: "/", maxAge: 0 });
      }
    } catch {
      // Ignore if outside storage context
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
    const settings = await readPlatformSettings();
    if (!settings.demoModeEnabled) {
      const current = await getCurrentUser();
      if (current.role !== "SUPER_ADMIN" && current.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Demo persona switching is currently disabled" },
          { status: 403 },
        );
      }
    }

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

    const session = await buildSessionFor(target.id);
    const res = NextResponse.json({ ok: true, activePersonaId: target.id, ...session, demoPersona: true });
    res.cookies.set({
      name: PERSONA_COOKIE,
      value: target.id,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    res.cookies.delete({ name: AUTH_COOKIE, path: "/" });
    return res;
  } catch (err) {
    console.error("[api/session] POST failed:", err);
    return NextResponse.json({ error: "Failed to switch persona" }, { status: 500 });
  }
}

