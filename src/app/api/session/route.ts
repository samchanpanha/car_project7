import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ALLOWED_PERSONA_IDS, PERSONA_COOKIE, getCurrentUser } from "@/lib/session";
import type { PersonaDTO, SessionDTO, TenantRole, UserRole } from "@/lib/dashboard-types";
import type { SellerType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Bilingual switcher labels per persona id. */
const PERSONA_META: Record<
  string,
  { label: { en: string; km: string }; tag: PersonaDTO["tag"] }
> = {
  usr_demo_buyer: {
    label: { en: "Buyer — Dara", km: "អ្នកទិញ — ដារា" },
    tag: "buyer",
  },
  usr_dealer_sokha: {
    label: { en: "Dealer Owner — Sokha", km: "ម្ចាស់ក្សេត្រ — សុខា" },
    tag: "dealer-owner",
  },
  usr_staff_chan: {
    label: { en: "Sales Staff — Chan", km: "បុគ្គលិកលក់ — ចាន់" },
    tag: "sales-staff",
  },
  usr_staff_sophea: {
    label: { en: "Inventory Manager — Sophea", km: "អ្នកគ្រប់គ្រងការផ្ទុក — សុភា" },
    tag: "inventory-manager",
  },
  usr_dealer_ppauto: {
    label: { en: "Dealer Owner — PP Auto", km: "ម្ចាស់ក្សេត្រ — ភីភី អូតូ" },
    tag: "dealer-owner",
  },
  usr_priv_vireak: {
    label: { en: "Private Seller — Vireak", km: "អ្នកលក់ឯកជន — វីរៈ" },
    tag: "private-seller",
  },
  usr_priv_sopheak: {
    label: { en: "Private Seller — Sopheak", km: "អ្នកលក់ឯកជន — សុភ័ក្ត្រ" },
    tag: "private-seller",
  },
  usr_admin: {
    label: { en: "Super Admin — Nita", km: "អ្នកគ្រប់គ្រងកំពូល — នីតា" },
    tag: "admin",
  },
};

async function buildSessionFor(userId: string): Promise<SessionDTO> {
  const [user, membership, personaUsers] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, include: { sellerProfile: true } }),
    db.tenantMember.findFirst({
      where: { userId, status: "ACTIVE" },
      include: { tenant: true },
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
      user: { id: "", name: "", role: "BUYER", locale: "km", avatarUrl: null },
      sellerType: null,
      tenant: null,
      personas,
    };
  }

  const sellerType: SellerType | null = user.sellerProfile
    ? user.sellerProfile.type === "DEALER"
      ? "DEALER"
      : "PRIVATE"
    : null;

  const session: SessionDTO = {
    user: {
      id: user.id,
      name: user.name,
      role: user.role as UserRole,
      locale: user.locale,
      avatarUrl: user.avatarUrl ?? null,
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
    personas,
  };
  return session;
}

export async function GET() {
  try {
    const current = await getCurrentUser();
    const session = await buildSessionFor(current.id);
    return NextResponse.json(session);
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
    return res;
  } catch (err) {
    console.error("[api/session] POST failed:", err);
    return NextResponse.json({ error: "Failed to switch persona" }, { status: 500 });
  }
}
