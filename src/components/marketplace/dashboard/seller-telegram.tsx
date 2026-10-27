"use client";

// Telegram Hub — SELLER / DEALER self-service growth tools:
//  1. Configure their own Telegram Mini App, channel and group links
//  2. Get a tracked invite link (/api/tg/<code>) with copy / share / QR
//  3. See live click stats from buyers joining through those links
// Buyer-facing join buttons read the same config from the seller DTOs.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import type { DictKey } from "@/lib/i18n";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { SellerTelegramDTO } from "@/lib/dashboard-types";
import {
  EmptyState, FetchErrorState, HBar, SectionCard, StatCard,
} from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot, Check, Copy, ExternalLink, Link2, Loader2, Megaphone, MousePointerClick,
  QrCode, Send, Share2, Sparkles, UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** t.me links (channel/group) — Telegram apps open these natively. */
const TME_RE = /^https:\/\/(t\.me|telegram\.me)\/\S+$/i;

type FormState = { miniAppUrl: string; channelUrl: string; groupUrl: string; chatId: string };
type FormErrors = Partial<Record<keyof FormState, string>>;
type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

function validateForm(form: FormState, t: TFn): FormErrors {
  const errors: FormErrors = {};
  const isUrl = (v: string) => {
    try { new URL(v); return true; } catch { return false; }
  };
  if (form.miniAppUrl && !(form.miniAppUrl.startsWith("https://") && isUrl(form.miniAppUrl))) {
    errors.miniAppUrl = t("tgErrMiniApp");
  }
  if (form.channelUrl && !TME_RE.test(form.channelUrl)) errors.channelUrl = t("tgErrTme");
  if (form.groupUrl && !TME_RE.test(form.groupUrl)) errors.groupUrl = t("tgErrTme");
  if (form.chatId && form.chatId.trim().length > 64) {
    errors.chatId = "Chat ID must be 64 characters or less";
  }
  return errors;
}

export function SellerTelegram() {
  const t = useT();
  const { data, loading, error, refetch } = useFetch<SellerTelegramDTO>("/api/seller/telegram");

  // form + dirty tracking
  const [form, setForm] = useState<FormState>({ miniAppUrl: "", channelUrl: "", groupUrl: "", chatId: "" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingBot, setTestingBot] = useState(false);
  // refreshed hub payload returned by PUT (wins over the fetch until refetch)
  const [saved, setSaved] = useState<SellerTelegramDTO | null>(null);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (data && !hydrated) {
      setForm({
        miniAppUrl: data.miniAppUrl ?? "",
        channelUrl: data.channelUrl ?? "",
        groupUrl: data.groupUrl ?? "",
        chatId: data.chatId ?? "",
      });
      setHydrated(true);
    }
  }, [data, hydrated]);

  // QR code PNG for the current universal invite link
  const universal = useMemo(
    () => (data && origin ? `${origin}/api/tg/${data.inviteCode}` : null),
    [data, origin],
  );
  useEffect(() => {
    let cancelled = false;
    if (!qrLink) { setQrDataUrl(null); return; }
    import("qrcode")
      .then((mod) => mod.default.toDataURL(qrLink, { margin: 1, width: 320, color: { dark: "#0f172a", light: "#ffffff" } }))
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [qrLink]);

  const dto = saved ?? data;

  const setField = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = async () => {
    const errs = validateForm(form, t);
    if (Object.values(errs).some(Boolean)) {
      setFormErrors(errs);
      toast.error(t("tgErrFix"));
      return;
    }
    setSaving(true);
    try {
      const res = await apiSend<SellerTelegramDTO>("/api/seller/telegram", "PUT", {
        miniAppUrl: form.miniAppUrl.trim() || null,
        channelUrl: form.channelUrl.trim() || null,
        groupUrl: form.groupUrl.trim() || null,
        chatId: form.chatId.trim() || null,
      });
      setSaved(res);
      setForm({
        miniAppUrl: res.miniAppUrl ?? "",
        channelUrl: res.channelUrl ?? "",
        groupUrl: res.groupUrl ?? "",
        chatId: res.chatId ?? "",
      });
      toast.success(t("tgSavedToast"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const testBotNotification = async () => {
    const targetChatId = form.chatId.trim();
    if (!targetChatId) {
      toast.error(t("tgSellerChatIdHint"));
      return;
    }
    setTestingBot(true);
    try {
      const res = await apiSend<{ success: boolean; message: string; chatId: string }>("/api/seller/telegram/test", "POST", {
        chatId: targetChatId,
      });
      if (res.success) {
        toast.success(t("tgTestBotSuccess"));
      } else {
        toast.error(res.message || t("tgTestBotFail"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tgTestBotFail"));
    } finally {
      setTestingBot(false);
    }
  };

  const copy = async (key: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedKey(key);
      toast.success(t("tgCopiedToast"));
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      toast.error(t("tgCopyFail"));
    }
  };

  const shareOnTelegram = (link: string) => {
    const text = t("tgShareText");
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
      "_blank", "noopener",
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!dto) return null;

  const configured = Boolean(dto.miniAppUrl || dto.channelUrl || dto.groupUrl);
  const links = {
    universal: `${origin}/api/tg/${dto.inviteCode}`,
    group: `${origin}/api/tg/${dto.inviteCode}?d=GROUP`,
    channel: `${origin}/api/tg/${dto.inviteCode}?d=CHANNEL`,
    miniApp: `${origin}/api/tg/${dto.inviteCode}?d=MINIAPP`,
  };
  const stats = dto.stats ?? {
    total: 0,
    byDest: { GROUP: 0, CHANNEL: 0, MINIAPP: 0 },
    last14: [],
  };
  const last14 = stats.last14 ?? [];
  const maxTrend = Math.max(1, ...last14.map((d) => d.count));

  return (
    <>
      {/* ---------- 1. configure destinations ---------- */}
      <SectionCard
        title={t("tgConfigTitle")}
        action={
          <Button size="sm" onClick={save} disabled={saving}>
            {saving
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
              : <Check className="h-4 w-4 mr-1.5" aria-hidden />}
            {t("tgSave")}
          </Button>
        }
      >
        <p className="mb-4 text-xs leading-relaxed text-slate-500">{t("tgConfigHint")}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tg-miniapp" className="flex items-center gap-1.5 text-xs">
              <Bot className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              {t("tgMiniAppLabel")}
            </Label>
            <Input
              id="tg-miniapp"
              type="url"
              inputMode="url"
              placeholder="https://t.me/YourBot/app"
              value={form.miniAppUrl}
              onChange={(e) => setField("miniAppUrl", e.target.value)}
              aria-invalid={Boolean(formErrors.miniAppUrl)}
              className={cn("h-9 text-xs", formErrors.miniAppUrl && "border-rose-400 focus-visible:ring-rose-200")}
            />
            <p className={cn("text-[11px] leading-snug", formErrors.miniAppUrl ? "text-rose-600" : "text-slate-400")}>
              {formErrors.miniAppUrl ?? t("tgMiniAppHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-channel" className="flex items-center gap-1.5 text-xs">
              <Megaphone className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              {t("tgChannelLabel")}
            </Label>
            <Input
              id="tg-channel"
              type="url"
              inputMode="url"
              placeholder="https://t.me/yourchannel"
              value={form.channelUrl}
              onChange={(e) => setField("channelUrl", e.target.value)}
              aria-invalid={Boolean(formErrors.channelUrl)}
              className={cn("h-9 text-xs", formErrors.channelUrl && "border-rose-400 focus-visible:ring-rose-200")}
            />
            <p className={cn("text-[11px] leading-snug", formErrors.channelUrl ? "text-rose-600" : "text-slate-400")}>
              {formErrors.channelUrl ?? t("tgChannelHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-group" className="flex items-center gap-1.5 text-xs">
              <UsersRound className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              {t("tgGroupLabel")}
            </Label>
            <Input
              id="tg-group"
              type="url"
              inputMode="url"
              placeholder="https://t.me/yourgroup"
              value={form.groupUrl}
              onChange={(e) => setField("groupUrl", e.target.value)}
              aria-invalid={Boolean(formErrors.groupUrl)}
              className={cn("h-9 text-xs", formErrors.groupUrl && "border-rose-400 focus-visible:ring-rose-200")}
            />
            <p className={cn("text-[11px] leading-snug", formErrors.groupUrl ? "text-rose-600" : "text-slate-400")}>
              {formErrors.groupUrl ?? t("tgGroupHint")}
            </p>
          </div>
        </div>

        {/* Telegram Bot Lead Notification Chat ID */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tg-chatid" className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Send className="h-3.5 w-3.5 text-sky-600" aria-hidden />
                {t("tgSellerChatIdLabel")}
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-sky-300 text-sky-700 hover:bg-sky-50"
                onClick={testBotNotification}
                disabled={testingBot || !form.chatId.trim()}
              >
                {testingBot ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3 w-3 mr-1.5" aria-hidden />
                )}
                {testingBot ? t("tgTestingBot") : t("tgTestBotBtn")}
              </Button>
            </div>
            <Input
              id="tg-chatid"
              type="text"
              placeholder={t("tgChatIdPlaceholder")}
              value={form.chatId}
              onChange={(e) => setField("chatId", e.target.value)}
              aria-invalid={Boolean(formErrors.chatId)}
              className={cn("h-9 text-xs font-mono", formErrors.chatId && "border-rose-400 focus-visible:ring-rose-200")}
            />
            <p className={cn("text-[11px] leading-snug", formErrors.chatId ? "text-rose-600" : "text-slate-400")}>
              {formErrors.chatId ?? t("tgSellerChatIdHint")}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ---------- 2. tracked invite links ---------- */}
      <SectionCard
        title={
          <div className="flex items-center gap-2">
            <span>{t("tgLinksTitle")}</span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium border",
                configured
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}
            >
              {configured ? t("tgStatusActive") : t("tgStatusDisabled")}
            </span>
          </div>
        }
      >
        <p className="mb-4 text-xs leading-relaxed text-slate-500">{t("tgLinksHint", { code: dto.inviteCode })}</p>

        {!configured && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs leading-relaxed text-amber-900 flex items-start gap-2.5">
            <span className="text-base leading-none">⚠️</span>
            <div>
              <p className="font-semibold">{t("tgStatusDisabled")}</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{t("tgLinksDisabledNotice")}</p>
            </div>
          </div>
        )}

        <div className={cn("space-y-2.5", !configured && "opacity-60")}>
          <LinkRow
            icon={<Link2 className="h-3.5 w-3.5 text-sky-600" aria-hidden />}
            label={t("tgLinkUniversal")}
            link={links.universal}
            ready={Boolean(origin) && configured}
            copied={copiedKey === "universal"}
            onCopy={() => copy("universal", links.universal)}
            onShare={() => shareOnTelegram(links.universal)}
            onQr={() => setQrLink(links.universal)}
          />
          <LinkRow
            icon={<UsersRound className="h-3.5 w-3.5 text-sky-600" aria-hidden />}
            label={t("tgLinkGroup")}
            link={links.group}
            ready={Boolean(origin) && configured && Boolean(dto.groupUrl)}
            copied={copiedKey === "group"}
            onCopy={() => copy("group", links.group)}
            onShare={() => shareOnTelegram(links.group)}
          />
          <LinkRow
            icon={<Megaphone className="h-3.5 w-3.5 text-sky-600" aria-hidden />}
            label={t("tgLinkChannel")}
            link={links.channel}
            ready={Boolean(origin) && configured && Boolean(dto.channelUrl)}
            copied={copiedKey === "channel"}
            onCopy={() => copy("channel", links.channel)}
            onShare={() => shareOnTelegram(links.channel)}
          />
          <LinkRow
            icon={<Bot className="h-3.5 w-3.5 text-sky-600" aria-hidden />}
            label={t("tgLinkMiniApp")}
            link={links.miniApp}
            ready={Boolean(origin) && configured && Boolean(dto.miniAppUrl)}
            copied={copiedKey === "miniApp"}
            onCopy={() => copy("miniApp", links.miniApp)}
            onShare={() => shareOnTelegram(links.miniApp)}
          />
        </div>
      </SectionCard>

      {/* ---------- 3. click stats ---------- */}
      <SectionCard title={t("tgStatsTitle")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={MousePointerClick} label={t("tgStatTotal")} value={stats.total ?? 0} />
          <StatCard icon={UsersRound} label={t("tgStatGroup")} value={stats.byDest?.GROUP ?? 0} />
          <StatCard icon={Megaphone} label={t("tgStatChannel")} value={stats.byDest?.CHANNEL ?? 0} />
          <StatCard icon={Bot} label={t("tgStatMiniapp")} value={stats.byDest?.MINIAPP ?? 0} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-600">{t("tgTrendTitle")}</p>
          {(stats.total ?? 0) === 0 ? (
            <EmptyState icon={MousePointerClick} text={t("tgNoClicks")} hint={t("tgNoClicksHint")} className="p-6" />
          ) : (
            <>
              <div className="flex h-24 items-end gap-1" role="img" aria-label={t("tgTrendTitle")}>
                {last14.map((d) => (
                  <div key={d.date} className="flex h-full flex-1 flex-col justify-end">
                    <div
                      className={cn("w-full rounded-t", d.count > 0 ? "bg-sky-500" : "bg-slate-100")}
                      style={{ height: `${Math.max(4, (d.count / maxTrend) * 100)}%` }}
                      title={`${d.date}: ${d.count}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                <span>{last14[0]?.date ? last14[0].date.slice(5) : ""}</span>
                <span>{last14[last14.length - 1]?.date ? last14[last14.length - 1].date.slice(5) : ""}</span>
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <HBar label={t("tgLinkGroup")} value={stats.byDest?.GROUP ?? 0} total={Math.max(1, stats.total ?? 0)} colorClass="bg-sky-500" />
                <HBar label={t("tgLinkChannel")} value={stats.byDest?.CHANNEL ?? 0} total={Math.max(1, stats.total ?? 0)} colorClass="bg-teal-500" />
                <HBar label={t("tgLinkMiniApp")} value={stats.byDest?.MINIAPP ?? 0} total={Math.max(1, stats.total ?? 0)} colorClass="bg-amber-500" />
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* ---------- 4. tips ---------- */}
      <SectionCard title={t("tgTipsTitle")}>
        <ul className="space-y-2.5 text-xs leading-relaxed text-slate-600">
          {(["tgTipBot", "tgTipShare", "tgTipWelcome", "tgTipBroadcast"] as const).map((key) => (
            <li key={key} className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* ---------- QR dialog ---------- */}
      <Dialog open={Boolean(qrLink)} onOpenChange={(o) => !o && setQrLink(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-sky-600" aria-hidden />
              {t("tgQrTitle")}
            </DialogTitle>
            <DialogDescription>{t("tgQrHint")}</DialogDescription>
          </DialogHeader>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={t("tgQrTitle")} className="mx-auto w-full max-w-[260px] rounded-lg border border-slate-200" />
          ) : (
            <Skeleton className="h-64 w-full rounded-lg" />
          )}
          <p className="break-all text-center text-[11px] text-slate-400">{qrLink}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- invite link row ----------

function LinkRow({
  icon, label, link, ready, copied, onCopy, onShare, onQr,
}: {
  icon: React.ReactNode;
  label: string;
  link: string;
  /** false → destination not configured / origin unknown: actions disabled */
  ready: boolean;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onQr?: () => void;
}) {
  const t = useT();
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 transition-all", !ready && "opacity-75")}>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-700">
        <div className="flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        {!ready && (
          <span className="text-[10px] font-normal text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
            {t("tgStatusDisabled")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <code className={cn("min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px]", ready ? "text-slate-600 font-mono" : "text-slate-400 italic")}>
          {ready ? link : "Disabled — set up destination above"}
        </code>
        <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={!ready} onClick={onCopy}>
          {copied
            ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            : <Copy className="h-3.5 w-3.5" aria-hidden />}
          <span className="ml-1.5 hidden sm:inline">{copied ? t("tgCopied") : t("tgCopy")}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 border-sky-200 text-sky-700 hover:bg-sky-50"
          disabled={!ready}
          onClick={onShare}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          <span className="ml-1.5 hidden sm:inline">{t("tgShare")}</span>
        </Button>
        {onQr && (
          <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={!ready} onClick={onQr} aria-label={t("tgQrTitle")}>
            <QrCode className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
        <a
          href={ready ? link : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!ready}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600",
            ready ? "hover:bg-slate-50 cursor-pointer" : "pointer-events-none opacity-40",
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{t("tgOpen")}</span>
        </a>
      </div>
    </div>
  );
}
