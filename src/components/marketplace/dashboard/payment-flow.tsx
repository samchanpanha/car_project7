"use client";

// Seller-side subscription payment flow — Manual KHQR only.
// The seller sees the Super Admin's QR (uploaded image first), pays with their
// banking app, uploads a screenshot of the confirmation, and submits. The
// submission (with the screenshot) is pushed to the admin's Telegram bot
// automatically; the subscription activates only after the Super Admin
// verifies the request (AWAITING_VERIFICATION → VERIFIED) — usually within
// 10 minutes, which is exactly what the seller is told after submitting.

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { apiSend, useFetch } from "@/lib/client-hooks";
import { fileToDataUrl } from "@/lib/image-client";
import { formatUsd, timeAgo } from "@/lib/format";
import type { PlanDTO } from "@/lib/dashboard-types";
import type {
  PaymentConfigDTO,
  SubscriptionPaymentDTO,
} from "@/lib/commerce-types";
import { PaymentStatusBadge, SectionCard } from "./bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Send, ExternalLink, QrCode, ClipboardList, ShieldOff,
  Camera, Check, CheckCircle2, Clock, Image as ImageIcon, FileText,
  RefreshCw, TriangleAlert, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KhqrZoomDialog, TrxIdGuideDialog } from "@/components/marketplace/trx-guide-dialog";

export function RequestSubscriptionDialog({
  open,
  onOpenChange,
  plan,
  cycle,
  priceUsd,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan: PlanDTO | null;
  cycle: "MONTHLY" | "YEARLY";
  priceUsd: number;
  onDone: () => void;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const config = useFetch<PaymentConfigDTO>(open ? "/api/tenant/payments/config" : null);

  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [creating, setCreating] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [readingImage, setReadingImage] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [zoomQrOpen, setZoomQrOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // reset on open
  useEffect(() => {
    if (open) {
      setManualRef("");
      setEvidenceImage(null);
      setEvidenceUrl("");
      setNote("");
      setCreating(false);
      setReadingImage(false);
      setSubmittedRef(null);
    }
  }, [open]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.85);
      setEvidenceImage(dataUrl);
    } catch {
      toast.error(t("payScreenshotRequired"));
    } finally {
      setReadingImage(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submitManual = async () => {
    setCreating(true);
    try {
      const res = await apiSend<{ payment: SubscriptionPaymentDTO; waitMinutes: number }>(
        "/api/tenant/payments", "POST",
        {
          plan: plan!.plan, billingCycle: cycle, currency,
          manualRef: manualRef.trim() || undefined,
          evidenceImage: evidenceImage ?? undefined,
          evidenceUrl: evidenceUrl.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
      if (res.payment?.status === "VERIFIED") {
        toast.success("🎉 Payment auto-approved via ABA PayWay! Subscription active.");
        onDone();
        onOpenChange(false);
        return;
      }
      // stay in the dialog: show the "wait up to 10 minutes" screen
      setSubmittedRef(manualRef.trim() || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setCreating(false);
    }
  };

  const finish = () => {
    onDone();
    onOpenChange(false);
  };

  const manual = config.data?.manual;
  const tgLink = manual?.telegram
    ? `https://t.me/${manual.telegram.replace(/^@/, "")}`
    : null;
  const disabled = config.data ? !config.data.enabled : false;
  const qrSrc =
    (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
    manual?.khqrImage ??
    manual?.khqrDataUrl ??
    (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");
  const canSubmit = manualRef.trim().length >= 4 || evidenceImage !== null;

  const steps = [
    { icon: QrCode, text: t("payStepPay") },
    { icon: Camera, text: t("payStepUpload") },
    { icon: ClipboardList, text: t("payStepSubmit") },
  ];

  // ---------- success screen: submitted, awaiting manual approval ----------
  if (submittedRef !== null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              {t("payWaitTitle")}
            </DialogTitle>
            <DialogDescription>
              {plan?.plan ?? ""} · {formatUsd(priceUsd)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-amber-900">{t("payPendingBanner")}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800/90">{t("payWaitDesc")}</p>
              </div>
            </div>
            <p className="text-center text-xs text-slate-500">
              {t("payWaitRef")}: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{submittedRef}</code>
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Send className="h-3 w-3" aria-hidden />
              {t("payAutoTelegram")}
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={finish}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
              {t("payWaitDone")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{t("payTitle")} — {plan?.plan ?? ""}</DialogTitle>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                className={cn("px-2 py-0.5 rounded cursor-pointer", currency === "USD" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600")}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency("KHR")}
                className={cn("px-2 py-0.5 rounded cursor-pointer", currency === "KHR" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600")}
              >
                KHR (៛)
              </button>
            </div>
          </div>
          <DialogDescription>
            {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${(priceUsd * 4100).toLocaleString()} KHR`} · {cycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}
          </DialogDescription>
        </DialogHeader>

        {disabled ? (
          <Alert className="border-amber-300 bg-amber-50">
            <ShieldOff className="h-4 w-4 text-amber-700" aria-hidden />
            <AlertDescription className="text-xs font-medium text-amber-900">
              {t("payDisabledNotice")}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {/* how it works */}
            <ol className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">{i + 1}</span>
                  <s.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  {s.text}
                </li>
              ))}
            </ol>
            <p className="flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-100 px-2.5 py-1.5 text-[11px] font-medium text-sky-800">
              <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("payAutoTelegram")}
            </p>

            {qrSrc ? (
              <div className="text-center">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setZoomQrOpen(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setZoomQrOpen(true); }}
                  className="group relative inline-block cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-amber-400 hover:shadow-md"
                  title="Click to zoom / enlarge KHQR"
                >
                  <img
                    src={qrSrc}
                    alt={t("payScanQr")}
                    className="mx-auto h-48 w-48 rounded-xl object-contain transition group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow">
                      🔍 Click to Zoom / Scan
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                      {cycle === "YEARLY" ? "KHQR · 1 Year Plan (12 Mo)" : "KHQR · 1 Month Plan"}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-500">
                  {t("payScanQr")} · <button type="button" onClick={() => setZoomQrOpen(true)} className="text-amber-600 underline font-semibold hover:text-amber-700 cursor-pointer">Click to enlarge</button>
                </p>
              </div>
            ) : manual?.hasKhqr ? (
              <Skeleton className="mx-auto h-48 w-48 rounded-xl" />
            ) : (
              <Alert>
                <AlertDescription className="text-xs">{t("payManualNoQr")}</AlertDescription>
              </Alert>
            )}
            {manual?.accountName && (
              <p className="text-center text-xs text-slate-500">
                {t("payConfigAccountName")}: <span className="font-semibold text-slate-700">{manual.accountName}</span>
              </p>
            )}
            {(locale === "km" ? manual?.instructionsKm : manual?.instructionsEn) && (
              <p className={cn(
                "whitespace-pre-line rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600",
                locale === "km" && "font-khmer",
              )}>
                {locale === "km" ? manual?.instructionsKm : manual?.instructionsEn}
              </p>
            )}
            {tgLink && (
              <a
                href={tgLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {t("payTelegramContact")} · {manual?.telegram}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}

            {/* screenshot upload */}
            <div>
              <Label className="text-xs text-slate-500">{t("payUploadLabel")}</Label>
              {evidenceImage ? (
                <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                  <img src={evidenceImage} alt={t("payScreenshotChip")} className="h-16 w-16 rounded-md border border-slate-100 object-cover" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="flex items-center gap-1 truncate text-[11px] text-emerald-700">
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("payScreenshotChip")}
                    </p>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]"
                        onClick={() => fileInput.current?.click()}>
                        {t("payUploadChange")}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-rose-600 hover:bg-rose-50"
                        onClick={() => setEvidenceImage(null)}>
                        {t("payUploadRemove")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={readingImage}
                  className={cn(
                    "mt-1.5 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50/50",
                    readingImage && "opacity-60",
                  )}
                >
                  {readingImage
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    : <Camera className="h-4 w-4 text-slate-400" aria-hidden />}
                  {t("payUploadChoose")}
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={t("payUploadLabel")}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="pay-ref" className="text-xs text-slate-500">{t("payBankRefLabel")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGuideOpen(true)}
                  className="h-6 px-1.5 text-[11px] font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-100/60"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Where to find Trx ID? (Sample)
                </Button>
              </div>
              <Input id="pay-ref" value={manualRef} onChange={(e) => setManualRef(e.target.value)}
                placeholder={t("payBankRefPlaceholder")} className="mt-1.5 h-9" maxLength={80} />
              <p className="mt-1 text-[11px] text-slate-400">{t("payScreenshotRequired")}</p>
            </div>
            <div>
              <Label htmlFor="pay-evidence" className="text-xs text-slate-500">{t("payEvidenceLabel")}</Label>
              <Input id="pay-evidence" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://…" className="mt-1.5 h-9" />
            </div>
            <div>
              <Label htmlFor="pay-note" className="text-xs text-slate-500">{t("payNoteLabel")}</Label>
              <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5" maxLength={300} />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>{t("cancel")}</Button>
              <Button size="sm" onClick={submitManual} disabled={creating || !canSubmit}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
                {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />}
                {t("paySubmitManual")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        planTitle={`${plan?.plan ?? "Plan"} (${cycle === "YEARLY" ? "Yearly" : "Monthly"})`}
        amountText={currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${(priceUsd * 4100).toLocaleString()} KHR`}
        currency={currency}
        accountName={manual?.accountName || "SAM CHAN PANHA"}
      />
      <TrxIdGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onUseSample={(id) => setManualRef(id)}
      />
    </Dialog>
  );
}

/**
 * Live "waiting for manual approval" banner — polls the tenant's payment list
 * so the seller sees the request disappear the moment the admin verifies it.
 */
export function PendingPaymentBanner() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, refetch } = useFetch<SubscriptionPaymentDTO[]>("/api/tenant/payments");

  // poll while mounted (the tab only mounts when visited — cheap enough)
  useEffect(() => {
    const id = setInterval(refetch, 20_000);
    return () => clearInterval(id);
  }, [refetch]);

  const pending = data?.filter((p) => p.status === "AWAITING_VERIFICATION") ?? [];
  if (pending.length === 0) return null;
  const p = pending[0];

  return (
    <Alert className="border-amber-300 bg-amber-50/80">
      <Clock className="h-4 w-4 text-amber-600" aria-hidden />
      <AlertTitle className="text-sm font-semibold text-amber-900">{t("payPendingBanner")}</AlertTitle>
      <AlertDescription className="text-xs text-amber-800/90">
        {t("payPendingBannerDesc", { ago: timeAgo(p.createdAt, locale) })}
        <span className="ml-1.5">
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">{p.reference}</code>
        </span>
      </AlertDescription>
    </Alert>
  );
}

/** Payment history for the current tenant with cancel for open requests. */
export function TenantPaymentHistory({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, loading, error, refetch } = useFetch<SubscriptionPaymentDTO[]>("/api/tenant/payments");
  const [busyId, setBusyId] = useState<string | null>(null);

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await apiSend(`/api/tenant/payments/${id}`, "DELETE");
      toast.success(t("payCancelledToast"));
      refetch();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (error && !data) return <p className="text-xs text-rose-600">{error}</p>;
  if (!data || data.length === 0) return null;

  return (
    <SectionCard title={t("payHistory")}>
      <ul className="divide-y divide-slate-100">
        {data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-800">
                {p.plan} · {formatUsd(p.amountUsd)}
                <PaymentStatusBadge status={p.status} />
                {p.hasEvidenceImage && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    <ImageIcon className="h-3 w-3" aria-hidden />
                    {t("payScreenshotChip")}
                  </span>
                )}
                <span className="text-[10px] font-normal text-slate-400">
                  {t("payMethodManual")}
                </span>
              </p>
              <p className="truncate text-[11px] text-slate-400">
                <code className="mr-1">{p.reference}</code>
                {p.manualRef ? `· ${t("payManualRef")}: ${p.manualRef}` : ""}
                {" · "}{timeAgo(p.createdAt, locale)}
                {p.telegramSentAt ? ` · ${t("payTgSent")}` : ""}
                {p.rejectionReason ? ` · ${t("payRejectedReason")}: ${p.rejectionReason}` : ""}
              </p>
            </div>
            {p.status === "AWAITING_VERIFICATION" && (
              <Button variant="ghost" size="sm" disabled={busyId === p.id}
                onClick={() => cancel(p.id)}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                {t("payCancel")}
              </Button>
            )}
            {p.status === "VERIFIED" && (
              <Button variant="outline" size="sm" asChild className="h-7 text-xs gap-1 text-slate-700 hover:bg-slate-50">
                <a href={`/api/tenant/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Receipt
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * Focused Subscription Paywall Card:
 * Shown when Free Trial or subscription is inactive/expired.
 * Focuses the user on choosing a plan (only active/enabled plans), selecting
 * currency (USD or KHR), and completing payment via ABA KHQR with auto-matching!
 */
export function SubscriptionPaywallCard({
  role,
  onActivated,
}: {
  role: "SELLER" | "DEALER";
  onActivated?: () => void;
}) {
  const config = useFetch<PaymentConfigDTO>("/api/tenant/payments/config");
  const platformSettings = useFetch<{
    freeTrialEnabled: boolean;
    freeTrialDays: number;
    plans?: Array<{
      plan: string;
      name?: string;
      priceUsdMonthly?: number;
      priceUsdYearly?: number;
      listingsLimit?: number;
      featuredLimit?: number;
      seats?: number;
      enabled?: boolean;
    }>;
  }>("/api/platform-settings");

  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [selectedPlan, setSelectedPlan] = useState<string>("PRO");
  const [manualRef, setManualRef] = useState("");
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [readingImage, setReadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submittedPayment, setSubmittedPayment] = useState<SubscriptionPaymentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomQrOpen, setZoomQrOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Filter only active, enabled plans (excluding FREE and disabled plans like BASIC if disabled)
  const activePlans = (
    platformSettings.data?.plans
      ? platformSettings.data.plans.filter(
          (p) => p.plan !== "FREE" && (p as any).enabled !== false,
        )
      : [
          { plan: "PRO", name: "Professional Plan", priceUsdMonthly: 49, priceUsdYearly: 490, listingsLimit: 50, featuredLimit: 10, seats: 5 },
          { plan: "ENTERPRISE", name: "Enterprise Dealership", priceUsdMonthly: 149, priceUsdYearly: 1490, listingsLimit: 999, featuredLimit: 30, seats: 20 },
        ]
  ).map((p) => ({
    key: p.plan as "BASIC" | "PRO" | "ENTERPRISE",
    title: p.name || `${p.plan} Plan`,
    priceMonthly: p.priceUsdMonthly ?? (p.plan === "BASIC" ? 19 : p.plan === "PRO" ? 49 : 149),
    priceYearly: p.priceUsdYearly ?? (p.plan === "BASIC" ? 190 : p.plan === "PRO" ? 490 : 1490),
    listingsLimit: p.listingsLimit ?? 50,
    featuredLimit: p.featuredLimit ?? 10,
    seats: p.seats ?? 5,
  }));

  // Ensure selected plan is one of the available active plans
  useEffect(() => {
    if (activePlans.length > 0 && !activePlans.some((p) => p.key === selectedPlan)) {
      setSelectedPlan(activePlans[0].key);
    }
  }, [activePlans, selectedPlan]);

  const currentPlan = activePlans.find((p) => p.key === selectedPlan) || activePlans[0] || {
    key: "PRO",
    title: "Professional Plan",
    priceMonthly: 49,
    priceYearly: 490,
    listingsLimit: 50,
    featuredLimit: 10,
    seats: 5,
  };

  const priceUsd = cycle === "YEARLY" ? currentPlan.priceYearly : currentPlan.priceMonthly;
  const priceKhr = priceUsd * 4100;

  const manual = config.data?.manual;
  const qrSrc =
    cycle === "YEARLY"
      ? manual?.khqrImageYearly || "/khqr/khqr-yearly.jpg"
      : manual?.khqrImageMonthly || "/khqr/khqr-monthly.jpg";

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.85);
      setEvidenceImage(dataUrl);
    } catch {
      toast.error("Could not read screenshot file");
    } finally {
      setReadingImage(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submitPayment = async () => {
    if (!manualRef.trim() && !evidenceImage) {
      setError("Please enter your bank Trx ID reference or attach a screenshot");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiSend<{ payment: SubscriptionPaymentDTO; waitMinutes: number }>(
        "/api/tenant/payments",
        "POST",
        {
          plan: selectedPlan,
          billingCycle: cycle,
          currency,
          manualRef: manualRef.trim() || undefined,
          evidenceImage: evidenceImage ?? undefined,
        },
      );

      if (res.payment.status === "VERIFIED") {
        setVerified(true);
        toast.success("🎉 Payment verified! Your subscription is active.");
        setTimeout(() => {
          onActivated?.();
        }, 1000);
      } else {
        setSubmittedPayment(res.payment);
        toast.info("Payment submitted! Awaiting instant ABA verification.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const payments = await apiSend<SubscriptionPaymentDTO[]>("/api/tenant/payments", "GET");
      const matched = payments.find((p) => p.status === "VERIFIED");
      if (matched) {
        setVerified(true);
        toast.success("🎉 Payment verified! Your subscription is active.");
        setTimeout(() => {
          onActivated?.();
        }, 1000);
      } else {
        toast.info("Still awaiting bank confirmation. If you just sent money, please wait a few seconds and try again.");
      }
    } catch {
      toast.error("Could not check payment status");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-4 sm:p-6 shadow-sm space-y-5">
      {/* Paywall Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold shadow-xs">
            <TriangleAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-950">
              {role === "DEALER" ? "Dealership" : "Seller"} Subscription Required
            </h3>
            <p className="text-xs text-amber-900/90 leading-relaxed">
              Free trial is inactive or expired. Complete payment for your subscription plan to unlock your vehicle listings and selling tools.
            </p>
          </div>
        </div>
        <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-bold text-xs uppercase px-2.5 py-1">
          Payment Required
        </Badge>
      </div>

      {verified && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <AlertTitle className="text-sm font-bold text-emerald-900">
            Payment Verified & Subscription Activated!
          </AlertTitle>
          <AlertDescription className="text-xs text-emerald-800">
            Your payment was matched via ABA PayWay. Unlocking your dashboard now...
          </AlertDescription>
        </Alert>
      )}

      {submittedPayment && !verified && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Clock className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-sky-950">
                Payment Submitted (Ref: #{submittedPayment.reference}) · Awaiting Bank Alert
              </p>
              <p className="mt-0.5 text-xs text-sky-800 leading-relaxed">
                Trx ID: <code className="font-mono font-bold bg-sky-100 px-1 py-0.5 rounded">{manualRef}</code>.
                Our Telegram banking integration is listening for the ABA bank payment alert.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={checkStatus}
            disabled={checking}
            className="h-8 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs"
          >
            {checking && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            <RefreshCw className={cn("h-3 w-3 mr-1", checking && "hidden")} />
            Check Verification Status
          </Button>
        </div>
      )}

      {/* Cycle & Currency Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Billing Cycle:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCycle("MONTHLY")}
              className={cn("px-2.5 py-1 rounded-md transition-all cursor-pointer", cycle === "MONTHLY" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600")}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("YEARLY")}
              className={cn("px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1", cycle === "YEARLY" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600")}
            >
              <span>Yearly</span>
              <span className="rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold px-1">Save 2 Mo</span>
            </button>
          </div>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Currency:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1",
                currency === "USD" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>💵 USD ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrency("KHR")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1",
                currency === "KHR" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>៛ KHR (Riel)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Plan Cards Grid (Only active plans shown; disabled plans like BASIC omitted!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activePlans.map((p) => {
          const isSelected = selectedPlan === p.key;
          const pPriceUsd = cycle === "YEARLY" ? p.priceYearly : p.priceMonthly;
          const pPriceKhr = pPriceUsd * 4100;
          return (
            <div
              key={p.key}
              onClick={() => setSelectedPlan(p.key)}
              className={cn(
                "rounded-xl border p-3.5 transition-all cursor-pointer text-left flex flex-col justify-between",
                isSelected
                  ? "border-amber-500 bg-white ring-2 ring-amber-500 shadow-xs"
                  : "border-slate-200 bg-white/80 hover:border-slate-300",
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{p.title}</span>
                  {p.key === "PRO" && (
                    <Badge className="bg-amber-500 text-slate-950 text-[9px] font-extrabold uppercase">
                      Recommended
                    </Badge>
                  )}
                </div>
                <div className="mt-2 text-xl font-black text-slate-900">
                  {currency === "USD" ? `$${pPriceUsd}.00 USD` : `៛${pPriceKhr.toLocaleString()} KHR`}
                  <span className="text-xs font-normal text-slate-400">/{cycle === "YEARLY" ? "year" : "month"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p.listingsLimit} Car Listings · {p.featuredLimit} Featured Spots · {p.seats} Staff Seats
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                className={cn(
                  "mt-3 w-full h-8 text-xs font-bold",
                  isSelected ? "bg-amber-500 hover:bg-amber-400 text-slate-950" : "bg-slate-100 hover:bg-slate-200 text-slate-700",
                )}
              >
                {isSelected ? "Selected" : "Choose Plan"}
              </Button>
            </div>
          );
        })}
      </div>

      {/* KHQR Card & Payment Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          {/* QR image */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setZoomQrOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setZoomQrOpen(true); }}
            className="group relative flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 text-center cursor-pointer transition hover:border-amber-400 hover:bg-amber-50/40"
            title="Click to zoom / enlarge KHQR"
          >
            <div className="relative">
              <img src={qrSrc} alt="ABA KHQR" className="h-44 w-44 rounded-lg object-contain transition group-hover:scale-105" />
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow">
                  🔍 Click to Zoom / Scan
                </span>
              </div>
            </div>
            <span className="mt-1.5 text-[11px] font-semibold text-slate-700">
              Payee: {manual?.accountName || "SAM CHAN PANHA"}
            </span>
            <span className="text-[10px] text-amber-700 font-medium">Click to enlarge</span>
          </div>

          {/* Amount Box & Instructions */}
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                Amount to Transfer ({currency})
              </span>
              <div className="mt-0.5 text-2xl font-black text-slate-900">
                {currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {currency === "USD" ? `Equivalent: ៛${priceKhr.toLocaleString()} KHR` : `Equivalent: $${priceUsd}.00 USD`} · {currentPlan.title}
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              1. Scan the KHQR code with <strong>ABA Mobile</strong> or any banking app.<br />
              2. Transfer exact amount: <strong>{currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}</strong>.<br />
              3. Enter the Trx ID / APV reference from your bank receipt below.
            </p>

            <div className="flex items-center gap-1.5 text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-2">
              <Zap className="h-4 w-4 text-sky-600 shrink-0" />
              <span>
                <strong>Instant Auto-Approval:</strong> Enter the ABA Trx ID from your payment confirmation screen to auto-activate in seconds.
              </span>
            </div>
          </div>
        </div>

        {/* Trx ID input & submit */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="paywall-trx-ref" className="text-xs font-bold text-slate-700">
                Bank Transaction Reference / Trx ID <span className="text-rose-600">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="h-6 px-1.5 text-[11px] font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-100/60"
              >
                <FileText className="h-3 w-3 mr-1" />
                Where to find Trx ID? (Sample Receipt)
              </Button>
            </div>
            <Input
              id="paywall-trx-ref"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              placeholder="e.g. 179264913984347 or 179264741214086"
              className="h-10 font-mono text-sm"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-600">{error}</p>
          )}

          <Button
            type="button"
            onClick={submitPayment}
            disabled={submitting || !manualRef.trim()}
            className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-xs"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify Payment & Unlock Dashboard
          </Button>
        </div>
      </div>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        planTitle={`${currentPlan.title} (${cycle === "YEARLY" ? "Yearly" : "Monthly"})`}
        amountText={currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}
        currency={currency}
        accountName={manual?.accountName || "SAM CHAN PANHA"}
      />
      <TrxIdGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onUseSample={(id) => setManualRef(id)}
      />
    </div>
  );
}
