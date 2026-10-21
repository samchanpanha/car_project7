"use client";

// Buyer-facing "join the seller's Telegram" buttons, shown on the vehicle
// detail page seller card and the seller storefront. Links go through the
// seller's tracked invite route (/api/tg/<code>?d=DEST) when a referral code
// exists so the seller's Telegram Hub stats count the click; raw URLs are
// used as a fallback for sellers who never opened the hub (code not minted).

import { useT } from "@/hooks/use-t";
import type { SellerTelegramLinksDTO } from "@/lib/types";
import { Bot, Megaphone, Send, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function SellerTelegramButtons({ seller, className }: { seller: SellerTelegramLinksDTO; className?: string }) {
  const t = useT();
  const code = seller.inviteCode;

  const items = [
    {
      key: "group",
      label: t("sellerJoinGroup"),
      icon: UsersRound,
      href: (code ? `/api/tg/${code}?d=GROUP` : seller.tgGroupUrl) ?? undefined,
      show: Boolean(seller.tgGroupUrl),
    },
    {
      key: "channel",
      label: t("sellerJoinChannel"),
      icon: Megaphone,
      href: (code ? `/api/tg/${code}?d=CHANNEL` : seller.tgChannelUrl) ?? undefined,
      show: Boolean(seller.tgChannelUrl),
    },
    {
      key: "miniapp",
      label: t("sellerOpenMiniApp"),
      icon: Bot,
      href: (code ? `/api/tg/${code}?d=MINIAPP` : seller.tgMiniAppUrl) ?? undefined,
      show: Boolean(seller.tgMiniAppUrl),
    },
  ].filter((i) => i.show && i.href);

  if (items.length === 0) return null;

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <a
          key={i.key}
          href={i.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
        >
          <i.icon className="h-3.5 w-3.5" aria-hidden />
          {i.label}
          <Send className="h-3 w-3 opacity-60" aria-hidden />
        </a>
      ))}
    </div>
  );
}
