import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import { toErrorResponse, HttpError } from "@/lib/api/guards";
import type { SellerTelegramDTO, TelegramDest } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

// ---------- validation ----------

/** "" → null so clearing a field in the UI round-trips cleanly. */
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

/** Mini Apps may be self-hosted — any https URL is allowed. */
const miniAppUrlSchema = z.preprocess(
  emptyToNull,
  z.string().url().max(300).nullable(),
);

/** Channels/groups must be t.me links so any Telegram app can open them. */
const tmeUrlSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .url()
    .max(300)
    .refine((v) => /^https:\/\/(t\.me|telegram\.me)\/\S+/i.test(v), {
      message: "must be a https://t.me/... link",
    })
    .nullable(),
);

const putSchema = z.object({
  miniAppUrl: miniAppUrlSchema.optional(),
  channelUrl: tmeUrlSchema.optional(),
  groupUrl: tmeUrlSchema.optional(),
});

// ---------- helpers ----------

const DESTS: TelegramDest[] = ["MINIAPP", "CHANNEL", "GROUP"];

/** Unambiguous alphabet (no I/l/1/O/0) — 8 chars ≈ 850k combos. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function mintCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Mint a unique referral code for the profile (no-op when one exists). */
async function ensureInviteCode(profileId: string): Promise<string> {
  const existing = await db.sellerProfile.findUnique({
    where: { id: profileId },
    select: { inviteCode: true },
  });
  if (existing?.inviteCode) return existing.inviteCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await db.sellerProfile.update({
        where: { id: profileId },
        data: { inviteCode: mintCode() },
        select: { inviteCode: true },
      });
      return updated.inviteCode as string;
    } catch {
      // P2002 unique collision — mint another code and retry.
    }
  }
  throw new HttpError(500, "Could not mint a unique invite code");
}

/** Guarantee a SellerProfile row for SELLER/DEALER accounts (registration
 *  already creates one — this only heals legacy/edge rows). */
async function ensureProfile(userId: string) {
  const found = await db.sellerProfile.findUnique({ where: { userId } });
  if (found) return found;
  return db.sellerProfile.create({ data: { userId, type: "PRIVATE" } });
}

/** Click stats for the hub: totals, per destination and a 14-day trend
 *  (UTC day buckets, oldest → newest). */
async function buildStats(profileId: string): Promise<SellerTelegramDTO["stats"]> {
  const dayMs = 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - 13 * dayMs);
  since.setUTCHours(0, 0, 0, 0);

  const [events, total] = await Promise.all([
    db.telegramInviteEvent.findMany({
      where: { profileId, createdAt: { gte: since } },
      select: { dest: true, createdAt: true },
    }),
    db.telegramInviteEvent.count({ where: { profileId } }),
  ]);

  const byDest: SellerTelegramDTO["stats"]["byDest"] = { MINIAPP: 0, CHANNEL: 0, GROUP: 0 };
  const buckets = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    buckets.set(new Date(since.getTime() + i * dayMs).toISOString().slice(0, 10), 0);
  }
  for (const e of events) {
    if ((DESTS as string[]).includes(e.dest)) byDest[e.dest as TelegramDest]++;
    const key = e.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return { total, byDest, last14: [...buckets].map(([date, count]) => ({ date, count })) };
}

async function buildDto(userId: string): Promise<SellerTelegramDTO> {
  const profile = await ensureProfile(userId);
  const inviteCode = await ensureInviteCode(profile.id);
  const stats = await buildStats(profile.id);
  return {
    miniAppUrl: profile.tgMiniAppUrl,
    channelUrl: profile.tgChannelUrl,
    groupUrl: profile.tgGroupUrl,
    inviteCode,
    stats,
  };
}

// ---------- handlers ----------

/**
 * GET /api/seller/telegram — Telegram Hub payload for the current
 * SELLER/DEALER account (config + invite code + click stats).
 */
export async function GET() {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (user.role !== "SELLER" && user.role !== "DEALER") {
      throw new HttpError(403, "Only seller and dealer accounts have a Telegram hub");
    }
    return NextResponse.json(await buildDto(user.id));
  } catch (err) {
    return toErrorResponse(err, "api/seller/telegram GET", "Failed to load Telegram settings");
  }
}

/**
 * PUT /api/seller/telegram { miniAppUrl?, channelUrl?, groupUrl? } — save the
 * seller's own Telegram destinations. Returns the refreshed hub payload.
 */
export async function PUT(req: Request) {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();
    if (user.role !== "SELLER" && user.role !== "DEALER") {
      throw new HttpError(403, "Only seller and dealer accounts have a Telegram hub");
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const profile = await ensureProfile(user.id);
    const data: Record<string, string | null> = {};
    if (parsed.data.miniAppUrl !== undefined) data.tgMiniAppUrl = parsed.data.miniAppUrl;
    if (parsed.data.channelUrl !== undefined) data.tgChannelUrl = parsed.data.channelUrl;
    if (parsed.data.groupUrl !== undefined) data.tgGroupUrl = parsed.data.groupUrl;

    if (Object.keys(data).length > 0) {
      await db.sellerProfile.update({ where: { id: profile.id }, data });
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: "SELLER_TELEGRAM_UPDATED",
          entity: "SellerProfile",
          entityId: profile.id,
          metaJson: JSON.stringify({ fields: Object.keys(data) }),
        },
      });
    }

    return NextResponse.json(await buildDto(user.id));
  } catch (err) {
    return toErrorResponse(err, "api/seller/telegram PUT", "Failed to save Telegram settings");
  }
}
