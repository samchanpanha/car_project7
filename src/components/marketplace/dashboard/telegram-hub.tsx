"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import type { SellerTelegramDTO } from "@/lib/dashboard-types";
import { EmptyState, FetchErrorState, HBar, SectionCard, StatCard } from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot, Check, CheckCircle2, Copy, ExternalLink, Link2, Loader2, Megaphone,
  MousePointerClick, QrCode, RefreshCw, Send, Share2, Sparkles, UsersRound,
  ShieldCheck, AlertTriangle, MessageSquare, CalendarDays, CreditCard, ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TME_RE = /^https:\/\/(t\.me|telegram\.me)\/\S+$/i;

type FormState = {
  miniAppUrl: string;
  channelUrl: string;
  groupUrl: string;
  chatId: string;
  notifyAppointments: boolean;
  notifyLeads: boolean;
  notifyPayments: boolean;
};

export function TelegramHub({ isDealer = false }: { isDealer?: boolean }) {
  const t = useT();
  const { me } = useAppStore();
  const { data, loading, error, refetch } = useFetch<SellerTelegramDTO>("/api/seller/telegram");

  const [form, setForm] = useState<FormState>({
    miniAppUrl: "",
    channelUrl: "",
    groupUrl: "",
    chatId: "",
    notifyAppointments: true,
    notifyLeads: true,
    notifyPayments: true,
  });

  const [saving, setSaving] = useState(false);
  const [testingPersonal, setTestingPersonal] = useState(false);
  const [testingGroup, setTestingGroup] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (data) {
      setForm((prev) => ({
        ...prev,
        miniAppUrl: data.miniAppUrl ?? prev.miniAppUrl,
        channelUrl: data.channelUrl ?? prev.channelUrl,
        groupUrl: data.groupUrl ?? prev.groupUrl,
        chatId: data.chatId ?? prev.chatId,
      }));
    }
  }, [data]);

  // Real-time listener: When the bot auto-links Telegram, refetch data automatically
  useRealtimeEvent("TELEGRAM_LINKED", () => {
    refetch();
    setQrOpen(false);
  });

  const botUsername = data?.botUsername || "KhmerSmartRestaurantBot";
  const userId = me?.user?.id || "";
  const directLinkUrl = `https://t.me/${botUsername}?start=link_${userId}`;
  const groupAddUrl = `https://t.me/${botUsername}?startgroup=true`;

  // QR Code generator
  useEffect(() => {
    let cancelled = false;
    if (!qrLink) {
      setQrDataUrl(null);
      return;
    }
    import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(qrLink, {
          margin: 1,
          width: 320,
          color: { dark: "#0f172a", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrLink]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiSend<SellerTelegramDTO>("/api/seller/telegram", "PUT", {
        miniAppUrl: form.miniAppUrl.trim() || null,
        channelUrl: form.channelUrl.trim() || null,
        groupUrl: form.groupUrl.trim() || null,
        chatId: form.chatId.trim() || null,
      });
      toast.success(t("tgSavedToast"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const testPersonalBot = async () => {
    const targetChatId = form.chatId.trim();
    if (!targetChatId) {
      toast.error("Please connect your Telegram bot first");
      return;
    }
    setTestingPersonal(true);
    try {
      const res = await apiSend<{ success?: boolean; ok?: boolean; message?: string; error?: string }>(
        "/api/seller/telegram/test",
        "POST",
        { chatId: targetChatId },
      );
      if (res.success || res.ok) {
        toast.success("✅ Test notification sent! Check your Telegram app.");
      } else {
        toast.error(res.error || res.message || t("tgTestBotFail"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tgTestBotFail"));
    } finally {
      setTestingPersonal(false);
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
      "_blank",
      "noopener",
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const isConnected = Boolean(data.chatId || form.chatId);
  const links = {
    universal: `${origin}/api/tg/${data.inviteCode}`,
    group: `${origin}/api/tg/${data.inviteCode}?d=GROUP`,
    channel: `${origin}/api/tg/${data.inviteCode}?d=CHANNEL`,
  };

  return (
    <div className="space-y-6">
      {/* Hero Bot Connection Card */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/60 to-blue-50/30 p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all",
                isConnected
                  ? "bg-gradient-to-tr from-sky-500 to-blue-600 text-white"
                  : "bg-slate-200 text-slate-500",
              )}
            >
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  KhLan Telegram CRM Bot
                </h3>
                {isConnected ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[11px] gap-1 px-2.5 py-0.5">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500 border-slate-200 text-[11px]">
                    Not Connected
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 max-w-xl leading-relaxed">
                Receive instant real-time alerts for customer test-drives, leads, and payment approvals directly on your phone via Telegram.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isConnected ? (
              <>
                <Button
                  size="sm"
                  asChild
                  className="bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-xs cursor-pointer gap-1.5"
                >
                  <a href={directLinkUrl} target="_blank" rel="noopener noreferrer">
                    <Send className="h-4 w-4" />
                    1-Click Connect
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQrLink(directLinkUrl);
                    setQrOpen(true);
                  }}
                  className="text-xs gap-1.5 cursor-pointer"
                >
                  <QrCode className="h-4 w-4" />
                  Show QR
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testPersonalBot}
                  disabled={testingPersonal}
                  className="text-xs font-semibold gap-1.5"
                >
                  {testingPersonal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 text-sky-600" />
                  )}
                  Test Personal Alert
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQrLink(directLinkUrl);
                    setQrOpen(true);
                  }}
                  className="text-xs text-slate-600"
                >
                  Re-link QR
                </Button>
              </div>
            )}
          </div>
        </div>

        {isConnected && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-950">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Linked Chat ID:</span>
              <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-sky-200">
                {data.chatId || form.chatId}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Shared Bot:</span>
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
              >
                @{botUsername}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Dealership Team Group Card (for dealerships) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <UsersRound className="h-4 w-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Dealership Team Group Notifications
              </h4>
              <p className="text-xs text-slate-500">
                Forward incoming leads and appointments to your staff Telegram group so sales reps can respond immediately.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            asChild
            variant="outline"
            className="text-xs font-semibold gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <a href={groupAddUrl} target="_blank" rel="noopener noreferrer">
              <Plus className="h-3.5 w-3.5" />
              Add Bot to Group
            </a>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <Label className="text-xs font-medium text-slate-600">Telegram Group URL</Label>
            <Input
              value={form.groupUrl}
              onChange={(e) => setForm((f) => ({ ...f, groupUrl: e.target.value }))}
              placeholder="https://t.me/joinchat/..."
              className="mt-1 h-8 text-xs bg-white"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <Label className="text-xs font-medium text-slate-600">Telegram Channel URL</Label>
            <Input
              value={form.channelUrl}
              onChange={(e) => setForm((f) => ({ ...f, channelUrl: e.target.value }))}
              placeholder="https://t.me/your_dealership_channel"
              className="mt-1 h-8 text-xs bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={saveSettings}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Save Destination Links
          </Button>
        </div>
      </div>

      {/* Buyer Growth & Tracked Share Links */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900">
            Tracked Invite & Growth Links
          </h4>
          <p className="text-xs text-slate-500">
            Share these links on Facebook, TikTok, or business cards. Clicks and buyer conversions are tracked in real time.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-slate-800">Universal Smart Invite</span>
              <p className="truncate font-mono text-[11px] text-slate-500">{links.universal}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy("univ", links.universal)}
                className="h-8 text-xs gap-1"
              >
                {copiedKey === "univ" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => shareOnTelegram(links.universal)}
                className="h-8 text-xs gap-1 text-sky-700"
              >
                <Share2 className="h-3 w-3" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQrLink(links.universal);
                  setQrOpen(true);
                }}
                className="h-8 text-xs gap-1"
              >
                <QrCode className="h-3 w-3" />
                QR
              </Button>
            </div>
          </div>
        </div>

        {/* Growth Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
          <StatCard icon={MousePointerClick} label="Total Clicks" value={data.stats.total} />
          <StatCard icon={UsersRound} label="Group Joins" value={data.stats.byDest.GROUP} />
          <StatCard icon={Megaphone} label="Channel Joins" value={data.stats.byDest.CHANNEL} />
          <StatCard icon={Bot} label="Mini App Opens" value={data.stats.byDest.MINIAPP} />
        </div>
      </div>

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Scan with Telegram
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Point your phone camera or Telegram scanner to connect instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Telegram Connect QR"
                className="h-56 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
              />
            ) : (
              <Skeleton className="h-56 w-56 rounded-xl" />
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Once you tap <b>Start</b> in Telegram, your dashboard will connect automatically.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Plus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
