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
  RefreshCw, TriangleAlert, Zap, Copy, Download,
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
  const [submittedPaymentId, setSubmittedPaymentId] = useState<string | null>(null);
  const [verifiedPayment, setVerifiedPayment] = useState<SubscriptionPaymentDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [zoomQrOpen, setZoomQrOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedPayee, setCopiedPayee] = useState(false);
  const [countdown, setCountdown] = useState(4);
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
      setSubmittedPaymentId(null);
      setVerifiedPayment(null);
      setRejectionReason(null);
      setCountdown(4);
    }
  }, [open]);

  // Live polling for verification when submitted
  useEffect(() => {
    if (!open || (!submittedPaymentId && !submittedRef) || verifiedPayment) return;
    const interval = setInterval(async () => {
      try {
        const payments = await apiSend<SubscriptionPaymentDTO[]>("/api/tenant/payments", "GET");
        const match = payments.find(
          (p) =>
            (submittedPaymentId && p.id === submittedPaymentId) ||
            (submittedRef && (p.reference === submittedRef || p.manualRef === submittedRef)),
        );
        if (match) {
          if (match.status === "VERIFIED") {
            setVerifiedPayment(match);
            sessionStorage.setItem("subscription_verified_alert", plan?.plan || match.plan || "PRO");
            toast.success(`🎉 Processing Completed! Your ${match.plan} subscription is now ACTIVE.`);
            onDone();
          } else if (match.status === "REJECTED") {
            setRejectionReason(match.rejectionReason || "Payment was rejected by administrator.");
          }
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [open, submittedPaymentId, submittedRef, verifiedPayment, plan?.plan, onDone]);

  // Countdown auto-reload upon verification
  useEffect(() => {
    if (!verifiedPayment) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          window.location.reload();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [verifiedPayment]);

  const manualCheck = async () => {
    setCheckingStatus(true);
    try {
      const payments = await apiSend<SubscriptionPaymentDTO[]>("/api/tenant/payments", "GET");
      const match = payments.find(
        (p) =>
          (submittedPaymentId && p.id === submittedPaymentId) ||
          (submittedRef && (p.reference === submittedRef || p.manualRef === submittedRef)),
      );
      if (match?.status === "VERIFIED") {
        setVerifiedPayment(match);
        sessionStorage.setItem("subscription_verified_alert", plan?.plan || match.plan || "PRO");
        toast.success(`🎉 Processing Completed! Your ${match.plan} subscription is now ACTIVE.`);
        onDone();
      } else if (match?.status === "REJECTED") {
        setRejectionReason(match.rejectionReason || "Payment was rejected by administrator.");
      } else {
        toast.info("Still awaiting bank/admin approval. Checking continuously in background...");
      }
    } catch {
      toast.error("Could not check payment status");
    } finally {
      setCheckingStatus(false);
    }
  };

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
        setVerifiedPayment(res.payment);
        sessionStorage.setItem("subscription_verified_alert", plan?.plan || "PRO");
        toast.success("🎉 Payment auto-approved via ABA PayWay! Subscription active.");
        onDone();
        return;
      }
      setSubmittedPaymentId(res.payment?.id || null);
      setSubmittedRef(manualRef.trim() || res.payment?.reference || null);
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

  const reloadPage = () => {
    window.location.reload();
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

  const copyPayee = () => {
    const name = manual?.accountName || "SAM CHAN PANHA";
    navigator.clipboard?.writeText(name);
    setCopiedPayee(true);
    toast.success(`Copied Payee: ${name}`);
    setTimeout(() => setCopiedPayee(false), 2000);
  };

  const copyAmount = () => {
    const amt = currency === "USD" ? `${priceUsd}` : `${priceUsd * 4100}`;
    navigator.clipboard?.writeText(amt);
    setCopiedAmount(true);
    toast.success(`Copied Amount: ${amt} ${currency}`);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const downloadQr = () => {
    if (!qrSrc) return;
    const link = document.createElement("a");
    link.href = qrSrc;
    link.download = `KHQR-${plan?.plan || "PRO"}-${currency}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("KHQR image downloaded to your device!");
  };

  const steps = [
    { icon: QrCode, text: t("payStepPay") },
    { icon: Camera, text: t("payStepUpload") },
    { icon: ClipboardList, text: t("payStepSubmit") },
  ];

  // ---------- SCREEN 1: APPROVED & VERIFIED (Celebration & Auto-Reload) ----------
  if (verifiedPayment !== null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden rounded-2xl border-2 border-emerald-400 bg-white dark:bg-slate-900 shadow-2xl">
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-md ring-8 ring-emerald-50">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 animate-in zoom-in-75 duration-300" />
            </div>
            <div>
              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-xs font-black uppercase px-3 py-1">
                Processing Completed
              </Badge>
              <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                🎉 Subscription Activated!
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Your payment has been verified &amp; approved. Your <strong className="text-emerald-700 dark:text-emerald-400">{verifiedPayment.plan || plan?.plan || "PRO"}</strong> plan is now active!
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-left space-y-1.5 text-emerald-950">
              <div className="flex justify-between">
                <span className="text-emerald-800 font-medium">Plan:</span>
                <span className="font-bold">{verifiedPayment.plan || plan?.plan} ({verifiedPayment.billingCycle || cycle})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-800 font-medium">Amount:</span>
                <span className="font-bold">${(verifiedPayment.amountUsd ?? priceUsd).toFixed(2)} USD</span>
              </div>
              {verifiedPayment.verifiedByName && (
                <div className="flex justify-between">
                  <span className="text-emerald-800 font-medium">Approved by:</span>
                  <span className="font-bold">{verifiedPayment.verifiedByName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-emerald-800 font-medium">Status:</span>
                <span className="font-extrabold text-emerald-700">● ACTIVE</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Reloading page in <strong className="text-slate-800 dark:text-slate-200">{countdown}s</strong> to unlock all PRO features...
            </p>

            <Button
              type="button"
              onClick={reloadPage}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md cursor-pointer"
            >
              Reload Page &amp; Unlock PRO Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- SCREEN 2: REJECTED NOTICE ----------
  if (rejectionReason !== null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <TriangleAlert className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Payment Rejected</h3>
            <p className="mt-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3 text-left">
              <strong>Reason:</strong> {rejectionReason}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setSubmittedPaymentId(null);
              setSubmittedRef(null);
              setRejectionReason(null);
            }}
            className="w-full bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold cursor-pointer"
          >
            Try Again / Re-upload Details
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- SCREEN 3: AWAITING APPROVAL (Live Listening Screen) ----------
  if (submittedRef !== null) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border-amber-300 shadow-xl bg-white dark:bg-slate-900">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-30" />
                <Clock className="h-6 w-6 relative" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t("payWaitTitle")}
                </h3>
                <p className="text-xs text-slate-500">
                  {plan?.plan ?? "PRO"} · {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${(priceUsd * 4100).toLocaleString()} KHR`}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs space-y-1.5 text-amber-950">
              <p className="font-semibold">{t("payPendingBanner")}</p>
              <p className="text-[11px] leading-relaxed text-amber-900/90">{t("payWaitDesc")}</p>
              <div className="pt-1.5 flex items-center justify-between border-t border-amber-200/60 text-[11px]">
                <span className="text-slate-600">Reference:</span>
                <code className="rounded bg-amber-100 px-2 py-0.5 font-bold font-mono text-amber-950">{submittedRef}</code>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live listening for approval... Automatically reloads when approved!
            </div>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Send className="h-3 w-3" />
              {t("payAutoTelegram")}
            </p>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={manualCheck}
                disabled={checkingStatus}
                className="flex-1 text-xs font-semibold h-9 cursor-pointer"
              >
                {checkingStatus && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", checkingStatus && "hidden")} />
                Check Status Now
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={finish}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 cursor-pointer"
              >
                Close to Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ---------- SCREEN 4: MAIN PAYMENT FORM (Scrollable, Large QR Image, Copy & Download) ----------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl border-amber-300 shadow-2xl bg-white dark:bg-slate-900">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 shrink-0" />
        
        {/* Header */}
        <DialogHeader className="px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t("payTitle")} — {plan?.plan ?? "PRO"}
              </DialogTitle>
              <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-black text-xs uppercase px-2 py-0.5">
                {plan?.plan ?? "PRO"}
              </Badge>
            </div>

            {/* Currency Switcher */}
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold shadow-inner">
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  currency === "USD"
                    ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
                )}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency("KHR")}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all cursor-pointer",
                  currency === "KHR"
                    ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs font-extrabold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
                )}
              >
                KHR (៛)
              </button>
            </div>
          </div>

          <DialogDescription className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
            <span className="text-amber-700 dark:text-amber-400 font-extrabold text-sm sm:text-base">
              {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${(priceUsd * 4100).toLocaleString()} KHR`}
            </span>{" "}
            · {cycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}
          </DialogDescription>
        </DialogHeader>

        {disabled ? (
          <div className="p-6">
            <Alert className="border-amber-300 bg-amber-50">
              <ShieldOff className="h-4 w-4 text-amber-700" aria-hidden />
              <AlertDescription className="text-xs font-medium text-amber-900">
                {t("payDisabledNotice")}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          /* Scrollable Body with smooth customized scrollbar */
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
            {/* Steps Guide */}
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                    {i + 1}
                  </span>
                  <s.icon className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                  <span className="truncate">{s.text}</span>
                </li>
              ))}
            </ol>

            <p className="flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 px-3 py-1.5 text-[11px] font-medium text-sky-800 dark:text-sky-300">
              <Send className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden />
              {t("payAutoTelegram")}
            </p>

            {/* LARGE QR SCAN CARD — Built for effortless phone scanning */}
            {qrSrc ? (
              <div className="rounded-2xl border-2 border-red-500/80 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm text-center">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 px-1">
                  <span className="font-extrabold text-[11px] tracking-wider text-red-600 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                    BAKONG KHQR · SCAN TO PAY
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {cycle === "YEARLY" ? "12-Month Plan" : "Monthly"}
                  </span>
                </div>

                {/* Big QR Code with Click-to-Zoom */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setZoomQrOpen(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setZoomQrOpen(true); }}
                  className="group relative inline-block cursor-pointer rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white p-3 shadow-inner transition hover:border-amber-400 hover:shadow-md"
                  title="Click to open Full-Screen Zoom View"
                >
                  <img
                    src={qrSrc}
                    alt={t("payScanQr")}
                    className="mx-auto h-64 w-64 sm:h-72 sm:w-72 md:h-80 md:w-80 rounded-xl object-contain transition group-hover:scale-102"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                    <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-md flex items-center gap-1.5">
                      🔍 Click to Full-Size View
                    </span>
                  </div>
                </div>

                {/* Payee and Amount with 1-Click Copy */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Payee: <span className="text-red-700 dark:text-red-400 font-extrabold">{manual?.accountName || "SAM CHAN PANHA"}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyPayee}
                      className="h-6 px-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                    >
                      {copiedPayee ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedPayee ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-xs sm:text-sm font-black px-3 py-1">
                      {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${(priceUsd * 4100).toLocaleString()} KHR`}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyAmount}
                      className="h-6 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-300 cursor-pointer"
                    >
                      {copiedAmount ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedAmount ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomQrOpen(true)}
                    className="h-7 text-xs font-semibold text-amber-800 dark:text-amber-300 border-amber-300 hover:bg-amber-50 cursor-pointer"
                  >
                    🔍 Full-Screen Scan View
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={downloadQr}
                    className="h-7 text-xs font-semibold text-slate-700 dark:text-slate-300 border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download QR Image
                  </Button>
                </div>
              </div>
            ) : manual?.hasKhqr ? (
              <Skeleton className="mx-auto h-64 w-64 rounded-xl" />
            ) : (
              <Alert>
                <AlertDescription className="text-xs">{t("payManualNoQr")}</AlertDescription>
              </Alert>
            )}

            {(locale === "km" ? manual?.instructionsKm : manual?.instructionsEn) && (
              <p className={cn(
                "whitespace-pre-line rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300",
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

            {/* SCREENSHOT UPLOAD */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3.5 space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>{t("payUploadLabel")}</span>
                <span className="text-[11px] font-normal text-slate-400">Step 2: Attach confirmation</span>
              </Label>
              {evidenceImage ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900">
                  <img
                    src={evidenceImage}
                    alt={t("payScreenshotChip")}
                    className="h-16 w-16 rounded-md border border-slate-200 object-cover shrink-0"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="flex items-center gap-1 truncate text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("payScreenshotChip")} attached
                    </p>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] cursor-pointer"
                        onClick={() => fileInput.current?.click()}
                      >
                        {t("payUploadChange")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-rose-600 hover:bg-rose-50 cursor-pointer"
                        onClick={() => setEvidenceImage(null)}
                      >
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
                    "flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-3 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-amber-400 hover:bg-amber-50/50",
                    readingImage && "opacity-60",
                  )}
                >
                  {readingImage
                    ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" aria-hidden />
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

            {/* BANK TRANSACTION REFERENCE */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pay-ref" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t("payBankRefLabel")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGuideOpen(true)}
                  className="h-6 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 hover:bg-amber-100/60 cursor-pointer"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Where to find Trx ID? (Sample)
                </Button>
              </div>
              <Input
                id="pay-ref"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder={t("payBankRefPlaceholder")}
                className="h-9"
                maxLength={80}
              />
              <p className="text-[11px] text-slate-400">{t("payScreenshotRequired")}</p>
            </div>

            {/* OPTIONAL EVIDENCE URL & NOTE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pay-evidence" className="text-xs text-slate-500">{t("payEvidenceLabel")}</Label>
                <Input
                  id="pay-evidence"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="pay-note" className="text-xs text-slate-500">{t("payNoteLabel")}</Label>
                <Input
                  id="pay-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional message..."
                  className="mt-1 h-8 text-xs"
                  maxLength={300}
                />
              </div>
            </div>
          </div>
        )}

        {/* Sticky DialogFooter */}
        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={creating}
            className="cursor-pointer"
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={submitManual}
            disabled={creating || !canSubmit}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 cursor-pointer shadow-sm"
          >
            {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />}
            {t("paySubmitManual")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        planTitle={`${plan?.plan ?? "PRO"} (${cycle === "YEARLY" ? "Yearly" : "Monthly"})`}
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
 * every 3 seconds while pending, and auto-reloads when approved with celebration!
 */
export function PendingPaymentBanner() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { data, refetch } = useFetch<SubscriptionPaymentDTO[]>("/api/tenant/payments");
  const hadPending = useRef(false);
  const [checking, setChecking] = useState(false);

  // Poll every 3 seconds while mounted so approval is picked up instantly
  useEffect(() => {
    const id = setInterval(refetch, 3_000);
    return () => clearInterval(id);
  }, [refetch]);

  const pending = data?.filter((p) => p.status === "AWAITING_VERIFICATION") ?? [];

  useEffect(() => {
    if (data && pending.length > 0) {
      hadPending.current = true;
    } else if (data && hadPending.current && pending.length === 0) {
      // Previously had a pending payment, now it disappeared / resolved!
      const latestVerified = data.find((p) => p.status === "VERIFIED");
      if (latestVerified) {
        hadPending.current = false;
        sessionStorage.setItem("subscription_verified_alert", latestVerified.plan || "PRO");
        toast.success(`🎉 Processing Completed! Your ${latestVerified.plan || "PRO"} subscription is now ACTIVE.`);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    }
  }, [data, pending.length]);

  const checkNow = async () => {
    setChecking(true);
    await refetch();
    setTimeout(() => setChecking(false), 500);
  };

  if (pending.length === 0) return null;
  const p = pending[0];

  return (
    <Alert className="border-amber-300 bg-amber-50/90 shadow-sm animate-in fade-in">
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="flex items-start gap-2.5">
          <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" aria-hidden />
          <div>
            <AlertTitle className="text-sm font-bold text-amber-950 flex items-center gap-2">
              {t("payPendingBanner")}
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live checking" />
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-900/90 mt-0.5">
              {t("payPendingBannerDesc", { ago: timeAgo(p.createdAt, locale) })}
              <span className="ml-1.5">
                <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold font-mono text-amber-950">
                  {p.reference}
                </code>
              </span>
              <span className="block text-[11px] text-amber-800 mt-1">
                ⚡ Linked to Telegram syncer &amp; Admin verification. Page auto-reloads upon approval.
              </span>
            </AlertDescription>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={checkNow}
          disabled={checking}
          className="h-7 text-xs font-semibold shrink-0 bg-white border-amber-300 hover:bg-amber-100/60 text-amber-950 cursor-pointer"
        >
          {checking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Check Status
        </Button>
      </div>
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
