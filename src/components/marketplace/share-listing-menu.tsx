"use client";

import { useState } from "react";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Share2, Send, Facebook, Link2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * "Facebook as funnel" share control for a listing. Share the vehicle URL to
 * Telegram, Facebook, or WhatsApp (the dominant channels in Cambodia), or copy
 * the link. Uses the current canonical page URL.
 */
export function ShareListingMenu({ title, compact }: { title?: string; compact?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = title ? `${title} — KhLan` : "KhLan";
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t("shareCopied"));
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label={t("shareLabel")}>
            <Share2 className="h-5 w-5" aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="text-xs text-slate-500 hover:text-slate-800">
            <Share2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            {t("shareLabel")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <a href={tg} target="_blank" rel="noreferrer" className="gap-2 cursor-pointer">
            <Send className="h-4 w-4 text-sky-600" aria-hidden />
            <span className="text-sm font-medium text-slate-800">{t("shareTelegram")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={fb} target="_blank" rel="noreferrer" className="gap-2 cursor-pointer">
            <Facebook className="h-4 w-4 text-blue-600" aria-hidden />
            <span className="text-sm font-medium text-slate-800">{t("shareFacebook")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={wa} target="_blank" rel="noreferrer" className="gap-2 cursor-pointer">
            <Send className="h-4 w-4 text-emerald-600" aria-hidden />
            <span className="text-sm font-medium text-slate-800">{t("shareWhatsApp")}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink} className="gap-2 cursor-pointer">
          {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Link2 className="h-4 w-4 text-slate-500" aria-hidden />}
          <span className="text-sm font-medium text-slate-800">{copied ? t("shareCopied") : t("shareCopyLink")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
