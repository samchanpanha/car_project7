import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const DESTS = new Set(["MINIAPP", "CHANNEL", "GROUP"]);

/**
 * GET /api/tg/<code>?d=MINIAPP|CHANNEL|GROUP — public tracked invite link.
 *
 * Sellers share these links (Telegram Hub → invite links); every buyer click
 * is recorded as a TelegramInviteEvent, then the visitor is 302-redirected
 * straight into the seller's Telegram destination:
 *   GROUP   → group, fallback channel → mini app
 *   CHANNEL → channel, fallback group → mini app
 *   MINIAPP → mini app, fallback channel → group
 *   (no ?d)  → group → channel → mini app (first configured wins)
 * Unknown codes / nothing configured redirect back to the KhLan home page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const origin = new URL(req.url).origin;
  try {
    const { code } = await params;
    const url = new URL(req.url);
    const requested = (url.searchParams.get("d") ?? "").toUpperCase();
    const dest = DESTS.has(requested) ? requested : null;

    const profile = await db.sellerProfile.findUnique({
      where: { inviteCode: code },
      select: { id: true, tgMiniAppUrl: true, tgChannelUrl: true, tgGroupUrl: true },
    });

    if (!profile) {
      return NextResponse.redirect(new URL("/", origin), 302);
    }

    const pick = (preferred: string | null): string | null => {
      const { tgGroupUrl: g, tgChannelUrl: c, tgMiniAppUrl: m } = profile;
      if (preferred === "GROUP") return g ?? c ?? m;
      if (preferred === "CHANNEL") return c ?? g ?? m;
      if (preferred === "MINIAPP") return m ?? c ?? g;
      return g ?? c ?? m;
    };
    const target = pick(dest);
    if (!target || !/^https?:\/\//i.test(target)) {
      return NextResponse.redirect(new URL("/", origin), 302);
    }

    try {
      await db.telegramInviteEvent.create({
        data: { profileId: profile.id, code, dest: dest ?? "UNIVERSAL" },
      });
    } catch (e) {
      // Never block the redirect because analytics failed.
      console.error("[api/tg/[code]] failed to record invite event:", e);
    }

    return NextResponse.redirect(target, 302);
  } catch (err) {
    console.error("[api/tg/[code]] GET failed:", err);
    return NextResponse.redirect(new URL("/", origin), 302);
  }
}
