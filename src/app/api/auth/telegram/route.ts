import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTH_COOKIE, createSessionToken, sessionCookieOptions, validateTelegramInitData } from "@/lib/auth";

export const dynamic = "force-dynamic";

const tgSchema = z.object({
  initData: z.string().min(1).max(4096),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = tgSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "initData is required" }, { status: 400 });
    }

    const result = validateTelegramInitData(parsed.data.initData);
    if (!result.ok || !result.user) {
      return NextResponse.json(
        { error: result.error ?? "Telegram validation failed" },
        { status: 401 },
      );
    }
    const tg = result.user;
    const tgId = String(tg.id);
    const displayName =
      [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() ||
      tg.username ||
      `Telegram ${String(tg.id).slice(-4)}`;

    // Find by Telegram id first, then by matching username-derived phone? No —
    // Telegram users without a shared phone have no phone; create a placeholder
    // phone that is unique but clearly synthetic. Users can bind a real phone
    // later from Profile settings.
    let user = await db.user.findUnique({ where: { telegramId: tgId } });

    if (!user) {
      const syntheticPhone = `+8557000${String(String(tg.id).slice(-5)).padStart(5, "0")}`.slice(0, 14);
      // Collision-safe: if the synthetic phone exists (same tg id recreated), fall back
      // to a random suffix — the phone is only a unique placeholder until bound.
      let phone = syntheticPhone;
      if (await db.user.findUnique({ where: { phone }, select: { id: true } })) {
        phone = `+8557001${String(Date.now()).slice(-6)}`;
      }
      user = await db.user.create({
        data: {
          name: displayName,
          phone,
          role: "BUYER",
          locale: "km",
          phoneVerified: false,
          telegramId: tgId,
          telegramUsername: tg.username ?? null,
          avatarUrl: tg.photo_url ?? null,
        },
      });
      await db.sellerProfile.create({ data: { userId: user.id, type: "PRIVATE" } });
    } else {
      // Keep profile fresh from Telegram on each login.
      user = await db.user.update({
        where: { id: user.id },
        data: {
          telegramUsername: tg.username ?? user.telegramUsername,
          avatarUrl: tg.photo_url ?? user.avatarUrl,
        },
      });
    }

    const res = NextResponse.json({
      ok: true,
      mode: result.mode, // "validated" with bot token, "demo" in the sandbox
      user: { id: user.id, name: user.name, role: user.role, locale: user.locale },
      isNew: false,
    });
    res.cookies.set({ name: AUTH_COOKIE, value: createSessionToken(user.id), ...await sessionCookieOptions() });
    res.cookies.delete({ name: "khlan_persona", path: "/" });
    return res;
  } catch (err) {
    console.error("[api/auth/telegram] failed:", err);
    return NextResponse.json({ error: "Telegram login failed" }, { status: 500 });
  }
}
