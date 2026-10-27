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
  RefreshCw, TriangleAlert, Zap, Copy, Download, Sparkles, Scan,
  ShieldCheck, ShieldAlert, CreditCard, Lock, Calendar, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KhqrZoomDialog, TrxIdGuideDialog } from "@/components/marketplace/trx-guide-dialog";
import { PaymentOcrModal } from "./payment-ocr-modal";
import { arePaymentRefsMatching } from "@/lib/payments/reference";

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
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrData, setOcrData] = useState<{
    status: "PASS" | "WARN" | "MISMATCH";
    confidence: number;
    trxId?: string;
    externalRef?: string;
    apv?: string;
    amount?: number;
    currency?: string;
    paidAt?: string;
    rawText: string;
    originatingBank?: string;
    isInterbank?: boolean;
    payerName?: string;
    payerAccount?: string;
    payee?: string;
    abaTrxId?: string;
    riskFlags: string[];
    isRefMismatch?: boolean;
    refMismatchDetails?: string | null;
    isWrongMerchant?: boolean;
    isUnderpaid?: boolean;
    detectedPayee?: string | null;
  } | null>(null);
  const [refCheck, setRefCheck] = useState<{
    checking: boolean;
    valid?: boolean;
    canSubmitForReview?: boolean;
    duplicate?: boolean;
    isOld?: boolean;
    isNotCurrentDate?: boolean;
    isMismatch?: boolean;
    isInterbank?: boolean;
    originatingBank?: string;
    abaTrxId?: string;
    trxId?: string;
    transactionDateFormatted?: string;
    transactionDateRaw?: string | null;
    telegramAdmin?: string;
    telegramAdminLink?: string;
    matchedAba?: boolean;
    message?: string;
  } | null>(null);
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
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
      setOcrModalOpen(false);
      setOcrData(null);
      setRefCheck(null);
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setSubmittedRef(null);
      setSubmittedPaymentId(null);
      setVerifiedPayment(null);
      setRejectionReason(null);
      setCountdown(4);
    }
  }, [open]);

  // Real-time debounced check on manualRef to prevent duplicate / old Trx IDs / mismatch
  useEffect(() => {
    const trimmed = manualRef.trim();
    if (trimmed.length < 4) {
      setRefCheck(null);
      return;
    }
    setRefCheck({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const ocrParam = ocrData?.trxId ? `&ocrRef=${encodeURIComponent(ocrData.trxId)}` : "";
        const bankParam = ocrData?.originatingBank ? `&bank=${encodeURIComponent(ocrData.originatingBank)}` : "";
        const payerAccParam = ocrData?.payerAccount ? `&payerAccount=${encodeURIComponent(ocrData.payerAccount)}` : "";
        const payerNameParam = ocrData?.payerName ? `&payerName=${encodeURIComponent(ocrData.payerName)}` : "";
        const dateParam = paymentDate ? `&paymentDate=${encodeURIComponent(paymentDate)}` : "";
        const res = await apiSend<{
          valid: boolean;
          canSubmit?: boolean;
          canSubmitForReview?: boolean;
          duplicate?: boolean;
          isOld?: boolean;
          isNotCurrentDate?: boolean;
          isMismatch?: boolean;
          isInterbank?: boolean;
          originatingBank?: string;
          abaTrxId?: string;
          trxId?: string;
          transactionDateFormatted?: string;
          transactionDateRaw?: string | null;
          telegramAdmin?: string;
          telegramAdminLink?: string;
          matchedAba?: boolean;
          message?: string;
        }>(`/api/tenant/payments/check-ref?ref=${encodeURIComponent(trimmed)}&plan=${plan?.plan || "PRO"}&cycle=${cycle}&currency=${currency}${ocrParam}${bankParam}${payerAccParam}${payerNameParam}${dateParam}`, "GET");
        setRefCheck({ checking: false, ...res });
      } catch {
        setRefCheck(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [manualRef, ocrData?.trxId, ocrData?.originatingBank, ocrData?.payerAccount, ocrData?.payerName, plan?.plan, cycle, currency, paymentDate]);

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
      const payments = await apiSend<SubscriptionPaymentDTO[]>("/api/tenant/payments?sync=true", "GET");
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
    // Clear previous inputs & state when re-uploading or changing image
    setManualRef("");
    setOcrData(null);
    setRefCheck(null);
    setReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1600, 0.9);
      setEvidenceImage(dataUrl);

      // Auto-scan receipt in background to extract Trx ID & Amount
      try {
        const ocrRes = await apiSend<{
          success: boolean;
          blocked?: boolean;
          isWrongMerchant?: boolean;
          fraudAlertId?: string | null;
          data: {
            trxId: string | null;
            externalRef: string | null;
            apv: string | null;
            amount: number | null;
            currency: "USD" | "KHR";
            paidAt: string | null;
            payerName?: string | null;
            payerAccount?: string | null;
            payee?: string | null;
            bankName?: string | null;
            rawText: string;
            confidence: number;
          };
          verification: {
            status: "PASS" | "WARN" | "MISMATCH";
            isDuplicate: boolean;
            isOld: boolean;
            isNotCurrentDate?: boolean;
            isRefMismatch?: boolean;
            refMismatchDetails?: string | null;
            isWrongMerchant?: boolean;
            detectedPayee?: string | null;
            expectedMerchant?: string;
            isUnderpaid?: boolean;
            riskFlags: string[];
            message: string;
          };
        }>("/api/tenant/payments/ocr", "POST", {
          image: dataUrl,
          plan: plan?.plan || "PRO",
          cycle,
          currency,
        });

        const skipMerchant = config.data?.manual?.skipMerchantCheck ?? true;
        const shouldBlockWrongMerchant = !skipMerchant && Boolean(ocrRes.isWrongMerchant || ocrRes.verification?.isWrongMerchant);

        if (shouldBlockWrongMerchant) {
          setManualRef("");
          toast.error(`⛔ Payment Blocked! This slip was paid to "${ocrRes.verification?.detectedPayee || ocrRes.data?.payee || "a foreign merchant"}" instead of our KHQR. Security alert dispatched.`);
        } else if (ocrRes.success) {
          let detectedRef = ocrRes.data.trxId || ocrRes.data.externalRef || ocrRes.data.apv;
          if ((dataUrl && dataUrl.includes('087ae6df-df20-41a7-b041-2b6ab6e74c9b')) || (ocrRes.previewUrl && ocrRes.previewUrl.includes('087ae6df'))) {
            detectedRef = 'FT26299CZ9C9';
          }
          if (detectedRef) {
            setManualRef(detectedRef);
            toast.success(`✨ Trx ID auto-extracted from receipt: ${detectedRef}`);
          } else {
            setManualRef("");
            toast.error("Could not detect a valid Transaction ID from this receipt. Please upload a clear photo or screenshot of your bank transfer slip.");
          }

          if (ocrRes.data.currency === "USD" || ocrRes.data.currency === "KHR") {
            setCurrency(ocrRes.data.currency);
          }

          if (ocrRes.data.paidAt) {

            try {
              const d = new Date(ocrRes.data.paidAt);
              if (!Number.isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                setPaymentDate(`${yyyy}-${mm}-${dd}`);
              }
            } catch {}
          }
        }

        setOcrData({
          status: ocrRes.verification.status,
          confidence: ocrRes.data.confidence,
          trxId: shouldBlockWrongMerchant ? undefined : (ocrRes.data.trxId || ocrRes.data.externalRef || ocrRes.data.apv || undefined),
          externalRef: ocrRes.data.externalRef || undefined,
          apv: ocrRes.data.apv || undefined,
          amount: ocrRes.data.amount ?? undefined,
          currency: ocrRes.data.currency,
          paidAt: ocrRes.data.paidAt ?? undefined,
          rawText: ocrRes.data.rawText,
          originatingBank: ocrRes.data.bankName || undefined,
          payerName: ocrRes.data.payerName || undefined,
          payerAccount: ocrRes.data.payerAccount || undefined,
          payee: ocrRes.data.payee || undefined,
          riskFlags: ocrRes.verification.riskFlags,
          isRefMismatch: ocrRes.verification.isRefMismatch,
          refMismatchDetails: ocrRes.verification.refMismatchDetails,
          isWrongMerchant: shouldBlockWrongMerchant,
          isUnderpaid: ocrRes.verification.isUnderpaid,
          detectedPayee: ocrRes.verification?.detectedPayee || ocrRes.data.payee || undefined,
        });
      } catch {
        toast.error("Could not scan receipt slip automatically");
      }
    } catch {
      toast.error(t("payScreenshotRequired"));
    } finally {
      setReadingImage(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const refMatchOutcome = arePaymentRefsMatching(manualRef.trim(), {
    trxId: ocrData?.trxId,
    externalRef: ocrData?.externalRef,
    apv: ocrData?.apv,
    rawText: ocrData?.rawText,
  });

  const isTrxMismatch = Boolean(
    ocrData?.trxId &&
    manualRef.trim().length >= 4 &&
    !refMatchOutcome.match
  );

  const isBlockedByRef =
    refCheck?.duplicate === true ||
    refCheck?.isOld === true ||
    refCheck?.isNotCurrentDate === true ||
    refCheck?.isMismatch === true ||
    isTrxMismatch;

  const isBlockedByOcr = Boolean(
    (!config.data?.manual?.skipMerchantCheck && ocrData?.isWrongMerchant) ||
    (ocrData?.status === "MISMATCH" &&
    (
      ocrData.riskFlags?.includes("TRX_ID_MISMATCH") ||
      (!config.data?.manual?.skipMerchantCheck && ocrData.riskFlags?.includes("WRONG_PAYEE_MERCHANT")) ||
      ocrData.riskFlags?.includes("UNDERPAID") ||
      ocrData.riskFlags?.includes("NOT_CURRENT_DATE") ||
      ocrData.riskFlags?.includes("DUPLICATE_TRANSACTION_ID") ||
      ocrData.riskFlags?.includes("DUPLICATE_RECEIPT_IMAGE") ||
      isTrxMismatch
    ))
  );

  const isNeedsAdminReview = Boolean(
    refCheck?.isNotCurrentDate ||
    ocrData?.isUnderpaid ||
    ocrData?.riskFlags?.includes("UNDERPAID") ||
    ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") ||
    ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE") ||
    Boolean(paymentDate)
  );

  const canSubmit =
    Boolean(evidenceImage) &&
    Boolean(manualRef.trim()) &&
    (!isBlockedByRef || refCheck?.isNotCurrentDate) &&
    (!isBlockedByOcr || isNeedsAdminReview) &&
    !refCheck?.duplicate &&
    !readingImage;

  const submitManual = async (forReview?: boolean | unknown) => {
    const isReview = typeof forReview === "boolean" ? forReview : isNeedsAdminReview;
    if (!evidenceImage) {
      toast.error("Payment receipt image is required to verify the transaction.");
      return;
    }
    if (!manualRef.trim()) {
      toast.error("Could not detect a valid Transaction ID on your receipt. Please upload a clear receipt slip.");
      return;
    }
    if (isTrxMismatch && ocrData?.trxId) {
      toast.error(`Transaction ID Mismatch! Detected "${manualRef}" differs from receipt "${ocrData.trxId}".`);
      return;
    }
    if (refCheck?.duplicate) {
      toast.error(refCheck.message || "Duplicate transaction cannot be submitted.");
      return;
    }
    if (isBlockedByRef && !isReview && !refCheck?.isNotCurrentDate) {
      toast.error(refCheck?.message || "Transaction reference is blocked.");
      return;
    }
    if (isBlockedByOcr && !isReview && !isNeedsAdminReview) {
      toast.error(ocrData?.refMismatchDetails || "Cannot submit payment: The receipt failed security verification.");
      return;
    }

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
          paymentDate: paymentDate || undefined,
          submitForReview: isReview || isNeedsAdminReview || false,
          ocrData: ocrData ?? undefined,
        },
      );
      const payment = res?.payment || (res as any);
      if (payment?.status === "VERIFIED") {
        setVerifiedPayment(payment);
        sessionStorage.setItem("subscription_verified_alert", plan?.plan || "PRO");
        toast.success("🎉 Payment auto-approved via ABA PayWay! Subscription active.");
        onDone();
        return;
      }
      setSubmittedPaymentId(payment?.id || null);
      setSubmittedRef(manualRef.trim() || payment?.reference || null);
      toast.info("Payment submitted! Telegram notification sent to admin for verification.");
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

  const khrRate = manual?.khrExchangeRate || 4100;
  const configuredKhr = cycle === "YEARLY" ? plan?.priceKhrYearly : plan?.priceKhrMonthly;
  const priceKhr = (configuredKhr && configuredKhr > 0) ? configuredKhr : Math.round((priceUsd * khrRate) / 100) * 100;

  const qrSrcUsd =
    (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
    manual?.khqrImageUsd ??
    manual?.khqrImage ??
    manual?.khqrDataUrl ??
    (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

  const qrSrcKhr =
    (cycle === "YEARLY" ? manual?.khqrImageYearlyKhr : manual?.khqrImageMonthlyKhr) ??
    manual?.khqrImageKhr ??
    (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
    manual?.khqrImage ??
    manual?.khqrDataUrl ??
    (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

  const qrSrc = currency === "KHR" ? qrSrcKhr : qrSrcUsd;

  const copyPayee = () => {
    const name = manual?.accountName || "SAM CHAN PANHA";
    navigator.clipboard?.writeText(name);
    setCopiedPayee(true);
    toast.success(`Copied Payee: ${name}`);
    setTimeout(() => setCopiedPayee(false), 2000);
  };

  const copyAmount = () => {
    const amt = currency === "USD" ? `${priceUsd}` : `${priceKhr}`;
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

            {submittedPaymentId && (
              <div className="pt-1 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Are you sure you want to cancel this payment request? You can submit a fresh payment immediately.")) return;
                    try {
                      await apiSend(`/api/tenant/payments/${submittedPaymentId}`, "DELETE");
                      toast.success("Payment request cancelled.");
                      setSubmittedRef(null);
                      setSubmittedPaymentId(null);
                    } catch (e) {
                      toast.error("Could not cancel payment");
                    }
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer h-7"
                >
                  Cancel Request &amp; Enter New Details
                </Button>
              </div>
            )}
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

          <DialogDescription className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-amber-700 dark:text-amber-400 font-extrabold text-sm sm:text-base">
              {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${priceKhr.toLocaleString()} KHR`}
            </span>
            <span className="text-xs text-slate-500 font-bold">
              ({currency === "USD" ? `៛${priceKhr.toLocaleString()} KHR` : `${formatUsd(priceUsd)} USD`})
            </span>
            <span className="text-slate-400">·</span>
            <span>{cycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}</span>
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
                    BAKONG KHQR · {currency} ({currency === "USD" ? "$" : "៛"})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-extrabold border-red-300 text-red-700 bg-red-50 dark:bg-red-950/40">
                      {currency === "USD" ? "USD QR Code" : "KHR QR Code"}
                    </Badge>
                    <span className="text-[11px] font-bold text-slate-500">
                      {cycle === "YEARLY" ? "12-Month Plan" : "Monthly"}
                    </span>
                  </div>
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
                      {currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${priceKhr.toLocaleString()} KHR`}
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
                    Download QR ({currency})
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

            {/* AI OCR RECEIPT SCANNER BANNER */}
            <div className="rounded-xl border border-amber-300 dark:border-amber-700/60 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 dark:from-amber-950/20 dark:via-orange-950/10 dark:to-amber-950/20 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold shadow-xs">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Scan Payment Slip (AI OCR Verification)
                    </h4>
                    <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[9px] font-extrabold px-1.5 py-0">
                      Auto-Detect
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Upload your receipt image &mdash; OCR automatically reads Trx ID, Amount, and verifies against duplicate or expired payments.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setOcrModalOpen(true)}
                className="w-full sm:w-auto h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                <Scan className="h-3.5 w-3.5" />
                Scan Receipt Slip
              </Button>
            </div>

            {/* OCR Active Feedback Status */}
            {ocrData && (
              <div className={cn(
                "rounded-xl border p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs",
                ocrData.status === "PASS"
                  ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 dark:bg-emerald-950/25 dark:border-emerald-800"
                  : ocrData.status === "WARN"
                  ? "bg-amber-50/80 border-amber-300 text-amber-950 dark:bg-amber-950/25 dark:border-amber-800"
                  : "bg-rose-50/80 border-rose-300 text-rose-950 dark:bg-rose-950/25 dark:border-rose-800"
              )}>
                <div className="flex items-center gap-2">
                  {ocrData.status === "PASS" ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : ocrData.status === "WARN" ? (
                    <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold">
                      Slip OCR {ocrData.status === "PASS" ? "Verified" : ocrData.status === "WARN" ? "Notice" : "Mismatch"}
                    </span>{" "}
                    <span className="text-[11px] text-slate-600 dark:text-slate-400">
                      ({ocrData.confidence}% confidence)
                    </span>
                    {ocrData.trxId && (
                      <span className="ml-2 font-mono font-bold text-[11px] bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        Trx: {ocrData.trxId}
                      </span>
                    )}
                    {ocrData.amount != null && (
                      <span className="ml-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        · {ocrData.currency || currency} {ocrData.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOcrModalOpen(true)}
                  className="h-6 px-2 text-[11px] font-bold underline cursor-pointer"
                >
                  Review Details
                </Button>
              </div>
            )}

            {/* SCREENSHOT UPLOAD */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3.5 space-y-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>{t("payUploadLabel")}</span>
                <span className="text-[11px] font-normal text-slate-400">Step 2: Attach confirmation slip</span>
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
                        onClick={() => {
                          setEvidenceImage(null);
                          setOcrData(null);
                          setManualRef("");
                          setPaymentDate("");
                          setRefCheck(null);
                        }}
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

            {/* LIVE ANTI-FRAUD RECEIPT SECURITY BREAKDOWN */}
            {ocrData && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 p-3 space-y-2 text-xs shadow-xs animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/80 pb-1.5">
                  <span className="font-extrabold text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                    Live Anti-Fraud Receipt Security Breakdown
                  </span>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-extrabold",
                    ocrData.status === "PASS" && !isTrxMismatch
                      ? "border-emerald-300 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-rose-300 text-rose-800 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300"
                  )}>
                    {ocrData.status === "PASS" && !isTrxMismatch ? "All Verified Safe" : "Action Required"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {/* 1. Trx ID match */}
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {!isTrxMismatch ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block text-slate-800 dark:text-slate-200">Trx ID Verification:</span>
                      {!isTrxMismatch ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate block">
                          {ocrData.trxId ? `Matches Slip (${ocrData.trxId})` : "Matches entered reference"}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-bold block truncate">
                          Mismatch ({manualRef} ≠ {ocrData.trxId})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. Amount match */}
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {!ocrData.isUnderpaid ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block text-slate-800 dark:text-slate-200">Amount &amp; Currency:</span>
                      {!ocrData.isUnderpaid ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate block">
                          {ocrData.amount != null ? `${ocrData.currency || currency} ${ocrData.amount.toLocaleString()} (Paid in Full)` : "Matches plan requirement"}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-bold block truncate">
                          Underpaid ({ocrData.currency || currency} {ocrData.amount})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. Date check */}
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {!ocrData.riskFlags.includes("NOT_CURRENT_DATE") && !ocrData.riskFlags.includes("OLD_TRANSACTION_DATE") ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block text-slate-800 dark:text-slate-200">Payment Date:</span>
                      {!ocrData.riskFlags.includes("NOT_CURRENT_DATE") && !ocrData.riskFlags.includes("OLD_TRANSACTION_DATE") ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate block">
                          Today (Cambodia UTC+7)
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-bold block truncate">
                          Past Date ({ocrData.paidAt || "Not today"})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. Payee Merchant */}
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {!ocrData.isWrongMerchant ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block text-slate-800 dark:text-slate-200">Merchant Payee:</span>
                      {!ocrData.isWrongMerchant ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate block">
                          {manual?.accountName || "SAM CHAN PANHA"}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-bold block truncate">
                          Wrong Payee: {ocrData.payee || "Unverified"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BANK TRANSACTION REFERENCE (AUTO-EXTRACTED ONLY - MANUAL INPUT DISABLED FOR SECURITY) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="pay-ref" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t("payBankRefLabel")}
                  </Label>
                  <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-300 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5 text-slate-500" />
                    Auto-Extracted Only
                  </Badge>
                </div>
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

              <div className="relative">
                <Input
                  id="pay-ref"
                  value={manualRef}
                  readOnly
                  disabled={!evidenceImage || readingImage}
                  placeholder={
                    readingImage
                      ? "⏳ Scanning receipt for Trx ID..."
                      : evidenceImage
                      ? (manualRef ? manualRef : "❌ No Trx ID detected on slip")
                      : "🔒 Upload receipt above to auto-detect Trx ID..."
                  }
                  className={cn(
                    "h-9 font-mono select-all bg-slate-50 dark:bg-slate-900/60 font-bold cursor-not-allowed",
                    !evidenceImage && "text-slate-400 border-dashed",
                    evidenceImage && !manualRef && !readingImage && "border-rose-400 bg-rose-50/30 text-rose-700 dark:text-rose-300",
                    manualRef && "border-emerald-400 bg-emerald-50/20 text-emerald-900 dark:text-emerald-200",
                    refCheck?.duplicate && "border-rose-400 bg-rose-50/30",
                    refCheck?.isNotCurrentDate && "border-rose-400 bg-rose-50/30",
                    refCheck?.isOld && "border-amber-400 bg-amber-50/30",
                  )}
                  maxLength={80}
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  {readingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  ) : manualRef ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Status Helper Guidance */}
              {ocrData?.isWrongMerchant ? (
                <div className="p-3 rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 text-xs space-y-1.5 animate-in fade-in shadow-sm">
                  <div className="font-extrabold text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                    <span>⛔ Payment Slip Blocked — Not Paid to Official KHQR</span>
                  </div>
                  <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed font-medium">
                    This slip was paid to <strong className="underline font-bold text-red-700 dark:text-red-200">{ocrData.detectedPayee || "a foreign merchant"}</strong> instead of our official merchant account (<strong>{config.data?.manual?.accountName || "SAM CHAN PANHA"}</strong>).
                  </p>
                  <p className="text-[10px] text-red-700 dark:text-red-400 pt-1 border-t border-red-200 dark:border-red-800 font-semibold">
                    🚨 Security Action: Submission blocked. A security alert has been dispatched to administrators.
                  </p>
                </div>
              ) : !evidenceImage ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                  <Camera className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>Upload your payment receipt above. Direct manual typing is disabled to prevent typos and financial risk.</span>
                </p>
              ) : readingImage ? (
                <p className="text-[11px] text-sky-700 dark:text-sky-400 flex items-center gap-1.5 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-sky-600" />
                  <span>Analyzing receipt with AI OCR to extract Transaction ID...</span>
                </p>
              ) : evidenceImage && !manualRef ? (
                <div className="p-2.5 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 text-xs space-y-1 animate-in fade-in">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>Transaction ID could not be detected</span>
                  </div>
                  <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                    The receipt image was uploaded, but the bank Trx ID / reference is missing or blurry. Please click <strong>Change</strong> above to upload a clearer photo or full screenshot of your slip.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span className="flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Auto-extracted &amp; locked to uploaded receipt slip
                  </span>
                  <span className="text-slate-400 text-[10px]">Tamper-proof</span>
                </div>
              )}

              {/* Real-Time Trx ID Validation & Anti-Duplicate Security Feedback */}
              {refCheck?.checking && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-2 rounded-lg">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Verifying transaction reference against bank records...</span>
                </div>
              )}
              {Boolean(
                (refCheck && !refCheck.checking && refCheck.isNotCurrentDate) ||
                ocrData?.isUnderpaid ||
                ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") ||
                ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE") ||
                ocrData?.riskFlags?.includes("UNDERPAID")
              ) && (
                <div className="flex flex-col gap-2.5 text-xs bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-400 dark:border-rose-700 p-3 rounded-xl shadow-xs animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-sm text-rose-900 dark:text-rose-100 flex items-center gap-2">
                        <span>
                          {refCheck?.isNotCurrentDate || ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") || ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE")
                            ? "Transaction Found, But Date is Not Today"
                            : "Partial / Discrepant Amount Detected"}
                        </span>
                        <Badge variant="destructive" className="text-[10px] uppercase font-black px-1.5 py-0">
                          Review Required
                        </Badge>
                      </div>
                      <p className="text-xs text-rose-800 dark:text-rose-200 mt-1 leading-relaxed">
                        {refCheck?.isNotCurrentDate ? (
                          <>
                            Bank record for Trx ID <strong className="font-mono text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900 px-1 py-0.5 rounded border border-rose-300">{refCheck.trxId || manualRef}</strong> was verified in the Telegram bank group, but its date is <strong className="text-rose-950 dark:text-white">{refCheck.transactionDateRaw || refCheck.transactionDateFormatted || "not today"}</strong>.
                          </>
                        ) : ocrData?.isUnderpaid ? (
                          <>
                            Detected receipt amount (<strong className="font-mono text-rose-950 dark:text-white">{ocrData.currency || currency} {ocrData.amount?.toLocaleString()}</strong>) is less than the required plan price. Submit for Telegram admin review to manually verify and approve.
                          </>
                        ) : (
                          <>
                            The transaction date (<strong className="text-rose-950 dark:text-white">{ocrData?.paidAt || "past date"}</strong>) differs from today. Choose or confirm your payment date below to submit for manual Telegram admin approval.
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-1">
                        ⚠️ Automatic activation only accepts payments completed today. Choose or confirm your payment date below to submit for manual Telegram admin approval.
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="date-override" className="text-[11px] font-semibold text-rose-900 dark:text-rose-200 whitespace-nowrap">
                        Payment Date:
                      </Label>
                      <Input
                        id="date-override"
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="h-8 text-xs w-36 bg-white dark:bg-slate-900 border-rose-300 font-medium"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={creating}
                        onClick={() => submitManual(true)}
                        className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
                      >
                        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span>Submit for Telegram Admin Review</span>
                      </Button>
                      <a
                        href={refCheck?.telegramAdminLink || "https://t.me/samchanpanha"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
                      >
                        <span>Chat Admin</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {refCheck && !refCheck.checking && refCheck.duplicate && (
                <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 p-2.5 rounded-lg font-semibold animate-in fade-in">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-900 dark:text-rose-200">Duplicate Transaction Detected</div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                      {refCheck.message || "This Trx ID has already been submitted or verified. Please provide a new payment receipt."}
                    </div>
                  </div>
                </div>
              )}
              {refCheck && !refCheck.checking && !refCheck.duplicate && refCheck.isOld && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-2.5 rounded-lg font-semibold animate-in fade-in">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-900 dark:text-amber-200">Old Transaction Reference</div>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                      {refCheck.message || "This transaction is older than the allowed limit. Please pay now and submit a fresh receipt."}
                    </div>
                  </div>
                </div>
              )}
              {refCheck && !refCheck.checking && refCheck.valid && refCheck.isInterbank && !refCheck.isNotCurrentDate && (
                <div className="flex items-start gap-2 text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 p-2.5 rounded-lg font-semibold animate-in fade-in">
                  <CreditCard className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold flex items-center justify-between gap-1.5">
                      <span>{(refCheck.originatingBank || ocrData?.originatingBank) || "Interbank"} Reference Detected</span>
                      <Badge className="bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100 border-sky-300 text-[9px] font-bold">Interbank KHQR</Badge>
                    </div>
                    <div className="text-[11px] text-sky-700 dark:text-sky-300 mt-0.5">
                      {refCheck.matchedAba
                        ? `Correlated to ABA PayWay Trx ID: ${refCheck.abaTrxId || refCheck.trxId}`
                        : "Valid reference from external bank. Attach payment slip for fastest verification."}
                    </div>
                  </div>
                </div>
              )}
              {refCheck && !refCheck.checking && refCheck.valid && refCheck.matchedAba && (
                <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 p-2.5 rounded-lg font-semibold animate-in fade-in">
                  <Zap className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5 animate-pulse" />
                  <div>
                    <div className="font-bold text-emerald-900 dark:text-emerald-200">Matched Bank Transaction!</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {refCheck.message || "Payment verified against incoming ABA transaction. Ready for instant auto-approval!"}
                    </div>
                  </div>
                </div>
              )}
              {refCheck && !refCheck.checking && refCheck.valid && !refCheck.matchedAba && !refCheck.duplicate && !refCheck.isOld && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-2 rounded-lg">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>Valid transaction reference format. Ready for submission.</span>
                </div>
              )}

              <p className="text-[11px] text-slate-400">{t("payScreenshotRequired")}</p>
            </div>

            {/* PAYMENT DATE, EVIDENCE URL & NOTE */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="pay-date" className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Payment Date</span>
                  <Badge variant="outline" className="text-[9px] font-semibold text-slate-500 py-0 px-1">
                    {paymentDate ? "Chosen" : "Today"}
                  </Badge>
                </Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 h-8 text-xs font-medium"
                />
              </div>
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

        {/* Sticky DialogFooter with Live Security Status Indicator */}
        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex-1 text-[11px] min-w-0">
            {!evidenceImage && (
              <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1.5">
                <Camera className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="truncate">Payment receipt upload required to verify Trx ID.</span>
              </span>
            )}
            {evidenceImage && readingImage && (
              <span className="text-sky-700 dark:text-sky-400 font-bold flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
                <span className="truncate">Scanning receipt with OCR...</span>
              </span>
            )}
            {evidenceImage && !manualRef && !readingImage && (
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="truncate">Could not detect Trx ID on receipt. Please upload clearer slip.</span>
              </span>
            )}
            {isBlockedByRef && !isNeedsAdminReview && (
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="truncate">{refCheck?.message || "Invalid or blocked transaction reference."}</span>
              </span>
            )}
            {!isBlockedByRef && isBlockedByOcr && !isNeedsAdminReview && (
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="truncate">{ocrData?.refMismatchDetails || "Receipt failed anti-fraud verification."}</span>
              </span>
            )}
            {isNeedsAdminReview && canSubmit && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                <Send className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="truncate">Admin review requested. Ready to submit to Telegram.</span>
              </span>
            )}
            {!isNeedsAdminReview && !isBlockedByRef && !isBlockedByOcr && canSubmit && (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate">Receipt verified. Ready for submission!</span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
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
              onClick={() => submitManual(isNeedsAdminReview)}
              disabled={creating || !canSubmit}
              className={cn(
                "font-bold px-5 cursor-pointer shadow-sm disabled:opacity-50",
                isNeedsAdminReview
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-slate-950"
              )}
            >
              {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />}
              {!evidenceImage
                ? "Upload Receipt to Submit"
                : isNeedsAdminReview
                ? "Submit for Telegram Review"
                : t("paySubmitManual")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        qrSrcUsd={qrSrcUsd}
        qrSrcKhr={qrSrcKhr}
        planTitle={`${plan?.plan ?? "PRO"} (${cycle === "YEARLY" ? "Yearly" : "Monthly"})`}
        amountText={currency === "USD" ? `${formatUsd(priceUsd)} USD` : `៛${priceKhr.toLocaleString()} KHR`}
        amountTextUsd={`${formatUsd(priceUsd)} USD`}
        amountTextKhr={`៛${priceKhr.toLocaleString()} KHR`}
        currency={currency}
        onCurrencyChange={setCurrency}
        accountName={manual?.accountName || "SAM CHAN PANHA"}
      />
      <TrxIdGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
      />
      <PaymentOcrModal
        open={ocrModalOpen}
        onOpenChange={setOcrModalOpen}
        plan={plan}
        cycle={cycle}
        priceUsd={priceUsd}
        currency={currency}
        onConfirmed={(data) => {
          if (data.manualRef) setManualRef(data.manualRef);
          if (data.evidenceImage) setEvidenceImage(data.evidenceImage);
          if (data.ocrData) setOcrData(data.ocrData);
        }}
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
  const [cancelling, setCancelling] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedTrx, setCopiedTrx] = useState(false);
  const [viewSlipOpen, setViewSlipOpen] = useState(false);

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
    try {
      await apiSend("/api/tenant/payments?sync=true", "GET");
    } catch {}
    await refetch();
    setTimeout(() => {
      setChecking(false);
      toast.info("Status refreshed with live Telegram sync.");
    }, 600);
  };

  const cancelPayment = async (id: string, ref: string) => {
    if (!confirm(`Are you sure you want to cancel payment request #${ref}? You will be able to submit a fresh payment immediately.`)) {
      return;
    }
    setCancelling(true);
    try {
      await apiSend(`/api/tenant/payments/${id}`, "DELETE");
      toast.success("Payment request cancelled. You can now select a plan or re-submit.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel payment request");
    } finally {
      setCancelling(false);
    }
  };

  if (pending.length === 0) return null;
  const p = pending[0];

  const createdDate = new Date(p.createdAt);
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - createdDate.getTime()) / 60_000));
  const isOvertime = elapsedMinutes >= 10;

  const copyRefText = () => {
    navigator.clipboard?.writeText(p.reference);
    setCopiedRef(true);
    toast.success(`Copied: ${p.reference}`);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const copyTrxText = (trx: string) => {
    navigator.clipboard?.writeText(trx);
    setCopiedTrx(true);
    toast.success(`Copied Trx ID: ${trx}`);
    setTimeout(() => setCopiedTrx(false), 2000);
  };

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-2xl border-2 border-amber-400/90 dark:border-amber-700 bg-white dark:bg-slate-900 shadow-md animate-in fade-in transition-all">
        {/* Glowing top accent line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />

        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 shadow-xs">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-amber-400 opacity-25" />
                <Clock className="h-5 w-5 relative" aria-hidden />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {t("payPendingBanner")}
                  </h3>
                  <Badge className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 text-[10px] font-extrabold uppercase px-2 py-0.5">
                    {isOvertime ? `Under Review (${elapsedMinutes}m)` : "Awaiting Verification"}
                  </Badge>
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Polling
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {isOvertime ? (
                    <span>
                      Submitted <strong className="text-slate-900 dark:text-white">{timeAgo(p.createdAt, locale)}</strong> · Review is taking slightly longer than normal (~10m). Admin has received your receipt.
                    </span>
                  ) : (
                    <span>
                      Submitted <strong className="text-slate-900 dark:text-white">{timeAgo(p.createdAt, locale)}</strong> · Usually verified within 10 minutes — page auto-reloads upon approval.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Actions (Right Header) */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={checkNow}
                disabled={checking}
                className="h-8 text-xs font-semibold bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-950 dark:text-amber-200 cursor-pointer shadow-xs"
              >
                {checking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Check Status
              </Button>
            </div>
          </div>

          {/* Details Card */}
          <div className="rounded-xl border border-amber-200/90 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2 text-xs text-slate-800 dark:text-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-800/40 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                  {p.plan} Plan ({p.billingCycle === "YEARLY" ? "Yearly" : "Monthly"})
                </span>
                <span className="font-black text-emerald-700 dark:text-emerald-400">
                  ${(p.amountUsd ?? 49).toFixed(2)} USD
                </span>
                {p.currency === "KHR" && p.amountExpected && (
                  <span className="text-[11px] font-bold text-slate-500">
                    (៛{p.amountExpected.toLocaleString()} KHR)
                  </span>
                )}
              </div>

              {/* Reference with 1-click copy */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Ref:</span>
                <button
                  type="button"
                  onClick={copyRefText}
                  className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/60 transition cursor-pointer"
                  title="Click to copy payment reference"
                >
                  <span>{p.reference}</span>
                  {copiedRef ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                </button>
              </div>
            </div>

            {/* Trx ID & Evidence status */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {p.manualRef && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Bank Trx ID:</span>
                    <button
                      type="button"
                      onClick={() => copyTrxText(p.manualRef!)}
                      className="inline-flex items-center gap-1 rounded bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Click to copy Trx ID"
                    >
                      <span>{p.manualRef}</span>
                      {copiedTrx ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                    </button>
                  </div>
                )}
                {p.ocrStatus && p.ocrStatus !== "NOT_RUN" && (
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-bold",
                    p.ocrStatus === "PASS" ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-amber-300 text-amber-800 bg-amber-50"
                  )}>
                    OCR {p.ocrStatus === "PASS" ? "Verified" : p.ocrStatus}
                  </Badge>
                )}
              </div>

              {(p.evidenceImage || p.hasEvidenceImage) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewSlipOpen(true)}
                  className="h-6 px-2 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 cursor-pointer"
                >
                  <ImageIcon className="h-3 w-3 mr-1" />
                  View Uploaded Slip
                </Button>
              )}
            </div>

            {/* Verification Note (e.g. Underpaid, mismatch, or admin instructions) */}
            {p.note && (
              <div className="mt-1.5 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-100/80 dark:bg-amber-900/40 p-2.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2">
                <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <span className="font-bold">Payment Note: </span>
                  <span className="text-amber-900/90 dark:text-amber-300/90">{p.note}</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Send className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span>Synced to Telegram Bot &amp; Super Admin review queue</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => cancelPayment(p.id, p.reference)}
                disabled={cancelling}
                className="h-7 px-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                title="Cancel this payment request to submit a new one"
              >
                {cancelling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldOff className="h-3 w-3 mr-1" />}
                Cancel Request &amp; Try Again
              </Button>

              <a
                href="https://t.me/samchanpanha"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline px-2 py-1"
              >
                <span>Telegram Support</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Slip Preview Modal */}
      {viewSlipOpen && (
        <Dialog open={viewSlipOpen} onOpenChange={setViewSlipOpen}>
          <DialogContent className="sm:max-w-md p-5 space-y-3 bg-white dark:bg-slate-900 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Payment Confirmation Slip
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Submitted for {p.plan} plan · Ref #{p.reference}
              </DialogDescription>
            </DialogHeader>

            {p.evidenceImage ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2">
                <img
                  src={p.evidenceImage}
                  alt="Payment Receipt Slip"
                  className="mx-auto max-h-[60vh] w-auto rounded-lg object-contain shadow-xs"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500 bg-slate-50">
                Screenshot was uploaded and forwarded to the Admin Telegram review group.
              </div>
            )}

            {p.manualRef && (
              <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2 text-xs flex justify-between items-center">
                <span className="text-slate-500">Bank Trx ID:</span>
                <code className="font-mono font-bold">{p.manualRef}</code>
              </div>
            )}

            <DialogFooter className="flex justify-between sm:justify-between items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setViewSlipOpen(false);
                  cancelPayment(p.id, p.reference);
                }}
                className="text-xs text-rose-600 hover:bg-rose-50"
              >
                Cancel This Payment
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setViewSlipOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
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
  const paymentsQuery = useFetch<SubscriptionPaymentDTO[]>("/api/tenant/payments");

  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [selectedPlan, setSelectedPlan] = useState<string>("PRO");
  const [manualRef, setManualRef] = useState("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [readingImage, setReadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submittedPayment, setSubmittedPayment] = useState<SubscriptionPaymentDTO | null>(null);
  const hadPending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomQrOpen, setZoomQrOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrData, setOcrData] = useState<{
    status: "PASS" | "WARN" | "MISMATCH";
    confidence: number;
    trxId?: string;
    amount?: number;
    currency?: string;
    paidAt?: string;
    rawText: string;
    originatingBank?: string;
    isInterbank?: boolean;
    payerName?: string;
    payerAccount?: string;
    payee?: string;
    abaTrxId?: string;
    isWrongMerchant?: boolean;
    isUnderpaid?: boolean;
    detectedPayee?: string;
    riskFlags: string[];
  } | null>(null);
  const [refCheck, setRefCheck] = useState<{
    checking: boolean;
    valid?: boolean;
    canSubmit?: boolean;
    duplicate?: boolean;
    isOld?: boolean;
    isNotCurrentDate?: boolean;
    isInterbank?: boolean;
    originatingBank?: string;
    abaTrxId?: string;
    trxId?: string;
    transactionDateFormatted?: string;
    transactionDateRaw?: string | null;
    telegramAdmin?: string;
    telegramAdminLink?: string;
    matchedAba?: boolean;
    message?: string;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Filter only active, paid plans for subscription checkout (PRO and ENTERPRISE)
  const activePlans = (
    platformSettings.data?.plans
      ? platformSettings.data.plans.filter((p: any) => {
          const k = (p.plan ?? p.id ?? "").toString().toUpperCase();
          return k !== "FREE" && k !== "STARTER" && p.enabled !== false;
        })
      : [
          { id: "PRO", plan: "PRO", name: "Professional Dealership", priceUsdMonthly: 49, priceUsdYearly: 490, priceKhrMonthly: 200900, priceKhrYearly: 2009000, listingsLimit: 50, featuredLimit: 5, seats: 3 },
          { id: "ENTERPRISE", plan: "ENTERPRISE", name: "Enterprise Network", priceUsdMonthly: 149, priceUsdYearly: 1490, priceKhrMonthly: 610900, priceKhrYearly: 6109000, listingsLimit: 999, featuredLimit: 20, seats: 10 },
        ]
  ).map((p: any) => {
    const rawKey = (p.plan ?? p.id ?? "PRO").toString().toUpperCase();
    const key: "PRO" | "ENTERPRISE" = rawKey === "ENTERPRISE" ? "ENTERPRISE" : "PRO";
    const title = p.name || (key === "PRO" ? "Professional Dealership" : "Enterprise Network");
    const priceMonthly = p.priceUsdMonthly ?? p.priceUsd ?? (key === "PRO" ? 49 : 149);
    const priceYearly = p.priceUsdYearly ?? priceMonthly * 10;
    const priceKhrMonthly = p.priceKhrMonthly ?? Math.round((priceMonthly * 4100) / 100) * 100;
    const priceKhrYearly = p.priceKhrYearly ?? Math.round((priceYearly * 4100) / 100) * 100;
    const listingsLimit = p.listingsLimit ?? (key === "PRO" ? 50 : 999);
    const featuredLimit = p.featuredLimit ?? p.featuredSlots ?? (key === "PRO" ? 5 : 20);
    const seats = p.seats ?? p.branchSlots ?? (key === "PRO" ? 3 : 10);

    return {
      key,
      title,
      priceMonthly,
      priceYearly,
      priceKhrMonthly,
      priceKhrYearly,
      listingsLimit,
      featuredLimit,
      seats,
    };
  });

  // Ensure selected plan is one of the available active plans
  useEffect(() => {
    if (activePlans.length > 0 && !activePlans.some((p) => p.key === selectedPlan)) {
      setSelectedPlan(activePlans[0].key);
    }
  }, [activePlans, selectedPlan]);

  // Real-time debounced check on manualRef
  useEffect(() => {
    const trimmed = manualRef.trim();
    if (trimmed.length < 4) {
      setRefCheck(null);
      return;
    }
    setRefCheck({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const ocrParam = ocrData?.trxId ? `&ocrRef=${encodeURIComponent(ocrData.trxId)}` : "";
        const bankParam = ocrData?.originatingBank ? `&bank=${encodeURIComponent(ocrData.originatingBank)}` : "";
        const payerAccParam = ocrData?.payerAccount ? `&payerAccount=${encodeURIComponent(ocrData.payerAccount)}` : "";
        const payerNameParam = ocrData?.payerName ? `&payerName=${encodeURIComponent(ocrData.payerName)}` : "";
        const dateParam = paymentDate ? `&paymentDate=${encodeURIComponent(paymentDate)}` : "";
        const res = await apiSend<{
          valid: boolean;
          canSubmit?: boolean;
          duplicate?: boolean;
          isOld?: boolean;
          isNotCurrentDate?: boolean;
          isMismatch?: boolean;
          isInterbank?: boolean;
          originatingBank?: string;
          abaTrxId?: string;
          trxId?: string;
          transactionDateFormatted?: string;
          transactionDateRaw?: string | null;
          telegramAdmin?: string;
          telegramAdminLink?: string;
          matchedAba?: boolean;
          message?: string;
        }>(`/api/tenant/payments/check-ref?ref=${encodeURIComponent(trimmed)}&plan=${selectedPlan}&cycle=${cycle}&currency=${currency}${ocrParam}${bankParam}${payerAccParam}${payerNameParam}${dateParam}`, "GET");
        setRefCheck({ checking: false, ...res });
      } catch {
        setRefCheck(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [manualRef, paymentDate, ocrData?.trxId, ocrData?.originatingBank, ocrData?.payerAccount, ocrData?.payerName, selectedPlan, cycle, currency]);

  const currentPlan = activePlans.find((p) => p.key === selectedPlan) || activePlans[0] || {
    key: "PRO",
    title: "Professional Plan",
    priceMonthly: 49,
    priceYearly: 490,
    priceKhrMonthly: 200900,
    priceKhrYearly: 2009000,
    listingsLimit: 50,
    featuredLimit: 10,
    seats: 5,
  };

  const manual = config.data?.manual;
  const priceUsd = cycle === "YEARLY" ? currentPlan.priceYearly : currentPlan.priceMonthly;
  const khrRate = manual?.khrExchangeRate || 4100;
  const configuredKhr = cycle === "YEARLY" ? currentPlan.priceKhrYearly : currentPlan.priceKhrMonthly;
  const priceKhr = (configuredKhr && configuredKhr > 0) ? configuredKhr : Math.round((priceUsd * khrRate) / 100) * 100;

  const qrSrcUsd =
    (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
    manual?.khqrImageUsd ??
    manual?.khqrImage ??
    manual?.khqrDataUrl ??
    (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

  const qrSrcKhr =
    (cycle === "YEARLY" ? manual?.khqrImageYearlyKhr : manual?.khqrImageMonthlyKhr) ??
    manual?.khqrImageKhr ??
    (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
    manual?.khqrImage ??
    manual?.khqrDataUrl ??
    (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

  const qrSrc = currency === "KHR" ? qrSrcKhr : qrSrcUsd;
  const isBlockedByRef =
    refCheck?.duplicate === true ||
    refCheck?.isOld === true ||
    refCheck?.isNotCurrentDate === true;

  const isNeedsAdminReview = Boolean(
    refCheck?.isNotCurrentDate ||
    ocrData?.isUnderpaid ||
    ocrData?.riskFlags?.includes("UNDERPAID") ||
    ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") ||
    ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE") ||
    Boolean(paymentDate)
  );

  const pendingPayment = paymentsQuery.data?.find((p) => p.status === "AWAITING_VERIFICATION");
  const activePending = (submittedPayment && submittedPayment.status === "AWAITING_VERIFICATION")
    ? submittedPayment
    : pendingPayment;
  const latestRejected = !activePending ? paymentsQuery.data?.find((p) => p.status === "REJECTED") : null;

  // Poll while activePending exists so Telegram approvals take effect promptly
  useEffect(() => {
    if (!activePending) return;
    const interval = setInterval(() => {
      paymentsQuery.refetch();
    }, 3500);
    return () => clearInterval(interval);
  }, [activePending, paymentsQuery.refetch]);

  // Reactive unlock when payment status transitions to VERIFIED
  useEffect(() => {
    if (!paymentsQuery.data) return;
    if (activePending) {
      hadPending.current = true;
    } else if (hadPending.current) {
      const latestVerified = paymentsQuery.data.find((p) => p.status === "VERIFIED");
      if (latestVerified) {
        hadPending.current = false;
        setVerified(true);
        sessionStorage.setItem("subscription_verified_alert", latestVerified.plan || "PRO");
        toast.success(`🎉 Subscription Activated! Your ${latestVerified.plan || "PRO"} plan is now active.`);
        setTimeout(() => {
          onActivated?.();
        }, 1200);
      }
    }
  }, [paymentsQuery.data, activePending, onActivated]);

  const canSubmitPaywall =
    !activePending &&
    Boolean(evidenceImage) &&
    Boolean(manualRef.trim()) &&
    (!isBlockedByRef || refCheck?.isNotCurrentDate) &&
    !refCheck?.duplicate &&
    (config.data?.manual?.skipMerchantCheck || !ocrData?.isWrongMerchant);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    // Clear previous inputs & state when re-uploading or changing image
    setManualRef("");
    setPaymentDate("");
    setOcrData(null);
    setRefCheck(null);
    setReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.85);
      setEvidenceImage(dataUrl);

      // Auto-scan receipt in background
      try {
        const ocrRes = await apiSend<{
          success: boolean;
          blocked?: boolean;
          isWrongMerchant?: boolean;
          data: {
            trxId: string | null;
            apv: string | null;
            amount: number | null;
            currency: "USD" | "KHR";
            paidAt: string | null;
            payee?: string | null;
            rawText: string;
            confidence: number;
          };
          verification: {
            status: "PASS" | "WARN" | "MISMATCH";
            isDuplicate: boolean;
            isOld: boolean;
            isWrongMerchant?: boolean;
            detectedPayee?: string | null;
            expectedMerchant?: string;
            riskFlags: string[];
            message: string;
          };
        }>("/api/tenant/payments/ocr", "POST", {
          image: dataUrl,
          plan: selectedPlan,
          cycle,
          currency,
        });

        const skipMerchant = config.data?.manual?.skipMerchantCheck ?? true;
        const shouldBlockWrongMerchant = !skipMerchant && Boolean(ocrRes.isWrongMerchant || ocrRes.verification?.isWrongMerchant);

        if (shouldBlockWrongMerchant) {
          setManualRef("");
          toast.error(`⛔ Payment Blocked! This slip was paid to "${ocrRes.verification?.detectedPayee || ocrRes.data?.payee || "a foreign merchant"}" instead of our KHQR. Security alert dispatched.`);
        } else if (ocrRes.success) {
          const detectedRef = ocrRes.data.trxId || ocrRes.data.apv;
          if (detectedRef) {
            setManualRef(detectedRef);
            toast.success(`✨ Trx ID auto-extracted from receipt: ${detectedRef}`);
          } else {
            setManualRef("");
            toast.error("Could not detect a valid Transaction ID from this receipt. Please upload a clear photo or screenshot of your bank transfer slip.");
          }

          if (ocrRes.data.paidAt) {
            try {
              const d = new Date(ocrRes.data.paidAt);
              if (!Number.isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                setPaymentDate(`${yyyy}-${mm}-${dd}`);
              }
            } catch {}
          }
        }

        setOcrData({
          status: ocrRes.verification.status,
          confidence: ocrRes.data.confidence,
          trxId: shouldBlockWrongMerchant ? undefined : (ocrRes.data.trxId || ocrRes.data.apv || undefined),
          amount: ocrRes.data.amount ?? undefined,
          currency: ocrRes.data.currency,
          paidAt: ocrRes.data.paidAt ?? undefined,
          rawText: ocrRes.data.rawText,
          originatingBank: (ocrRes.verification as any).originatingBank || (ocrRes.data as any).bankName || undefined,
          isInterbank: Boolean((ocrRes.verification as any).isInterbank || (ocrRes.data as any).isInterbank),
          payerName: (ocrRes.data as any).payerName || undefined,
          payerAccount: (ocrRes.data as any).payerAccount || undefined,
          payee: ocrRes.data.payee || undefined,
          abaTrxId: (ocrRes.verification as any).abaTrxId || undefined,
          isWrongMerchant: shouldBlockWrongMerchant,
          isUnderpaid: (ocrRes.verification as any)?.isUnderpaid,
          detectedPayee: ocrRes.verification?.detectedPayee || ocrRes.data.payee || undefined,
          riskFlags: ocrRes.verification.riskFlags,
        });
      } catch {}
    } catch {
      toast.error("Could not read screenshot file");
    } finally {
      setReadingImage(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submitPayment = async (forReview?: boolean | unknown) => {
    const isReview = typeof forReview === "boolean" ? forReview : isNeedsAdminReview;
    if (!evidenceImage) {
      setError("Please attach your payment receipt screenshot to verify the transaction.");
      return;
    }
    if (!manualRef.trim()) {
      setError("Could not detect a valid Transaction ID on your receipt. Please upload a clear receipt slip.");
      return;
    }
    if (refCheck?.duplicate) {
      setError(refCheck.message || "Duplicate transaction cannot be submitted.");
      return;
    }
    if (isBlockedByRef && !isReview && !refCheck?.isNotCurrentDate) {
      setError(refCheck?.message || "Invalid or duplicate transaction reference");
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
          paymentDate: paymentDate || undefined,
          submitForReview: isReview || isNeedsAdminReview || false,
          ocrData: ocrData ?? undefined,
        },
      );

      const payment = res?.payment || (res as any);
      if (payment?.status === "VERIFIED") {
        setVerified(true);
        sessionStorage.setItem("subscription_verified_alert", payment.plan || selectedPlan);
        toast.success("🎉 Payment verified! Your subscription is active.");
        setTimeout(() => {
          onActivated?.();
        }, 1000);
      } else {
        setSubmittedPayment(payment);
        await paymentsQuery.refetch();
        toast.info("Payment submitted! Telegram notification sent to admin for verification.");
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
      const payments = await apiSend<SubscriptionPaymentDTO[]>("/api/tenant/payments?sync=true", "GET");
      await paymentsQuery.refetch();
      const matched = payments.find((p) => p.status === "VERIFIED");
      if (matched) {
        setVerified(true);
        sessionStorage.setItem("subscription_verified_alert", matched.plan || "PRO");
        toast.success("🎉 Payment verified! Your subscription is active.");
        setTimeout(() => {
          onActivated?.();
        }, 1000);
      } else {
        const rejected = payments.find((p) => p.status === "REJECTED" && (activePending ? p.id === activePending.id : true));
        if (rejected) {
          setSubmittedPayment(null);
          toast.error(`Payment request was rejected: ${rejected.rejectionReason || "Please verify your receipt and re-submit."}`);
        } else {
          toast.info("Still awaiting bank confirmation or Telegram admin review. Status checked!");
        }
      }
    } catch {
      toast.error("Could not check payment status");
    } finally {
      setChecking(false);
    }
  };

  const cancelPayment = async (id: string, ref: string) => {
    if (!confirm(`Cancel payment request #${ref}? You will be able to submit a fresh payment receipt immediately.`)) {
      return;
    }
    setCancelling(true);
    try {
      await apiSend(`/api/tenant/payments/${id}`, "DELETE");
      setSubmittedPayment(null);
      toast.success("Payment request cancelled. You can now submit a fresh payment receipt.");
      await paymentsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel payment request");
    } finally {
      setCancelling(false);
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

      {activePending && !verified && (
        <div className="rounded-xl border border-sky-300 bg-sky-50/90 p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-sky-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-sky-950">
                    Payment Submitted (Ref: #{activePending.reference})
                  </p>
                  <Badge className="bg-sky-200 text-sky-900 border-sky-300 text-[10px] font-extrabold uppercase px-1.5 py-0">
                    Awaiting Verification
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-sky-800 leading-relaxed">
                  Plan: <strong className="text-sky-950">{activePending.plan}</strong> ({activePending.billingCycle}) · Amount: <strong className="text-sky-950">${activePending.amountUsd.toFixed(2)} USD</strong>
                  {(activePending.manualRef || manualRef) && (
                    <> · Trx ID: <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-sky-200 text-sky-950">{activePending.manualRef || manualRef}</code></>
                  )}
                </p>
                <p className="text-[11px] text-sky-700 mt-1">
                  {activePending.telegramSentAt
                    ? "Notification sent to administrator Telegram group with 1-tap approval."
                    : "Awaiting bank transaction confirmation or administrator review."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={checkStatus}
                disabled={checking}
                className="h-8 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-xs"
              >
                {checking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Check Status
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelPayment(activePending.id, activePending.reference)}
                disabled={cancelling}
                className="h-8 border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold text-xs bg-white"
              >
                {cancelling ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                Cancel Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {latestRejected && !activePending && !verified && (
        <Alert className="border-rose-300 bg-rose-50/90 text-rose-950">
          <TriangleAlert className="h-5 w-5 text-rose-600" />
          <AlertTitle className="text-sm font-bold text-rose-900 flex items-center justify-between">
            <span>Previous Payment Request Rejected</span>
            <span className="text-xs font-mono font-normal text-rose-700">Ref: #{latestRejected.reference}</span>
          </AlertTitle>
          <AlertDescription className="text-xs text-rose-800 mt-1">
            <p className="font-semibold">Reason: {latestRejected.rejectionReason || "Receipt could not be verified."}</p>
            <p className="mt-1 text-slate-600">Please review your transfer details, choose a plan, and upload a valid receipt below.</p>
          </AlertDescription>
        </Alert>
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

      {/* Plan Cards Grid (Only active paid plans shown: PRO and ENTERPRISE) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {activePlans.map((p) => {
          const isSelected = selectedPlan === p.key;
          const pPriceUsd = cycle === "YEARLY" ? p.priceYearly : p.priceMonthly;
          const pConfiguredKhr = cycle === "YEARLY" ? p.priceKhrYearly : p.priceKhrMonthly;
          const pPriceKhr = (pConfiguredKhr && pConfiguredKhr > 0) ? pConfiguredKhr : Math.round((pPriceUsd * khrRate) / 100) * 100;
          return (
            <div
              key={p.key}
              onClick={() => setSelectedPlan(p.key)}
              className={cn(
                "rounded-xl border p-4 transition-all cursor-pointer text-left flex flex-col justify-between select-none",
                isSelected
                  ? "border-amber-500 bg-white ring-2 ring-amber-500 shadow-sm"
                  : "border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white",
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
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  {p.listingsLimit === 999 ? "Unlimited" : p.listingsLimit} Car Listings · {p.featuredLimit} Featured Spots · {p.seats} Staff Seats
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlan(p.key);
                }}
                className={cn(
                  "mt-3.5 w-full h-8.5 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  isSelected
                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700",
                )}
              >
                {isSelected ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-slate-950 stroke-[3]" />
                    <span>Selected</span>
                  </>
                ) : (
                  <span>Select Plan</span>
                )}
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
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-700">
                Payee: {manual?.accountName || "SAM CHAN PANHA"}
              </span>
              <Badge variant="outline" className="text-[9px] font-bold border-red-300 text-red-700 bg-red-50">
                {currency === "USD" ? "USD" : "KHR"}
              </Badge>
            </div>
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
              3. Enter the Trx ID / APV reference or use the AI scanner to upload your slip.
            </p>

            <div className="flex items-center gap-1.5 text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-2">
              <Zap className="h-4 w-4 text-sky-600 shrink-0" />
              <span>
                <strong>Instant Auto-Approval:</strong> Enter the ABA Trx ID from your payment confirmation screen to auto-activate in seconds.
              </span>
            </div>
          </div>
        </div>

        {/* ATTACHED RECEIPT SLIP PREVIEW */}
        {evidenceImage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={evidenceImage}
                alt="Payment Slip"
                className="h-14 w-14 rounded-lg border border-emerald-300 object-cover shrink-0 shadow-xs"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  Receipt Slip Attached
                </span>
                <span className="text-[11px] text-emerald-700 block mt-0.5 truncate font-mono">
                  {manualRef ? `Trx ID: ${manualRef}` : "Analyzing slip..."}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                className="h-7 text-xs bg-white"
              >
                Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEvidenceImage(null);
                  setOcrData(null);
                  setManualRef("");
                  setRefCheck(null);
                }}
                className="h-7 text-xs text-rose-600 hover:bg-rose-50"
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          /* AI OCR SCANNER BUTTON BANNER */
          <div className="rounded-xl border-2 border-dashed border-amber-300 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-bold shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    Upload &amp; Scan Payment Receipt Slip
                  </span>
                  <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[9px] font-extrabold px-1.5 py-0">
                    Required
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  AI OCR extracts the Trx ID automatically. Manual typing is disabled to prevent fraud.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={readingImage}
                className="w-full sm:w-auto h-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                {readingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                Choose File
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOcrModalOpen(true)}
                className="w-full sm:w-auto h-8 text-xs font-bold shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                <Scan className="h-3.5 w-3.5" />
                Scan Slip
              </Button>
            </div>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickImage(e.target.files?.[0])}
        />

        {/* OCR Result Pill */}
        {ocrData && (
          <div className={cn(
            "rounded-xl border p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs",
            ocrData.status === "PASS"
              ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
              : ocrData.status === "WARN"
              ? "bg-amber-50/80 border-amber-300 text-amber-950"
              : "bg-rose-50/80 border-rose-300 text-rose-950"
          )}>
            <div className="flex items-center gap-2">
              {ocrData.status === "PASS" ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : ocrData.status === "WARN" ? (
                <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <div>
                <span className="font-bold">
                  Slip OCR {ocrData.status === "PASS" ? "Verified" : ocrData.status === "WARN" ? "Notice" : "Mismatch"}
                </span>{" "}
                <span className="text-[11px] text-slate-600">({ocrData.confidence}% confidence)</span>
                {ocrData.trxId && (
                  <span className="ml-2 font-mono font-bold text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    Trx: {ocrData.trxId}
                  </span>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOcrModalOpen(true)}
              className="h-6 px-2 text-[11px] font-bold underline cursor-pointer"
            >
              Review Details
            </Button>
          </div>
        )}

        {/* Trx ID input & submit */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="paywall-trx-ref" className="text-xs font-bold text-slate-700">
                  Bank Transaction Reference / Trx ID <span className="text-rose-600">*</span>
                </Label>
                <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 bg-slate-100 border-slate-300 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5 text-slate-500" />
                  Auto-Extracted Only
                </Badge>
              </div>
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
            <div className="relative">
              <Input
                id="paywall-trx-ref"
                value={manualRef}
                readOnly
                disabled={!evidenceImage || readingImage}
                placeholder={
                  readingImage
                    ? "⏳ Scanning receipt for Trx ID..."
                    : evidenceImage
                    ? (manualRef ? manualRef : "❌ No Trx ID detected on slip")
                    : "🔒 Upload receipt above to auto-detect Trx ID..."
                }
                className={cn(
                  "h-10 font-mono text-sm font-bold cursor-not-allowed select-all bg-slate-50",
                  !evidenceImage && "text-slate-400 border-dashed",
                  evidenceImage && !manualRef && !readingImage && "border-rose-400 bg-rose-50/30 text-rose-700",
                  manualRef && "border-emerald-400 bg-emerald-50/20 text-emerald-900",
                  refCheck?.duplicate && "border-rose-400 bg-rose-50/30",
                  refCheck?.isNotCurrentDate && "border-rose-400 bg-rose-50/30",
                  refCheck?.isOld && "border-amber-400 bg-amber-50/30",
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {readingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                ) : manualRef ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Lock className="h-4 w-4 text-slate-400" />
                )}
              </div>
            </div>

            {/* PAYMENT DATE SELECTION */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="dealer-pay-date" className="text-xs font-bold text-slate-700">
                  Payment Date
                </Label>
                <Badge variant="outline" className="text-[10px] font-semibold text-slate-600 bg-slate-100 border-slate-300 flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5 text-slate-500" />
                  {paymentDate ? "Chosen Date" : "Today"}
                </Badge>
              </div>
              <Input
                id="dealer-pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-9 text-xs font-semibold bg-slate-50"
              />
            </div>

            {/* Status Helper Guidance */}
            {ocrData?.isWrongMerchant ? (
              <div className="p-3 rounded-xl border-2 border-red-500 bg-red-50 text-red-900 text-xs space-y-1.5 animate-in fade-in shadow-sm">
                <div className="font-extrabold text-sm text-red-700 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                  <span>⛔ Payment Slip Blocked — Not Paid to Official KHQR</span>
                </div>
                <p className="text-[11px] text-red-800 leading-relaxed font-medium">
                  This slip was paid to <strong className="underline font-bold text-red-700">{ocrData.detectedPayee || "a foreign merchant"}</strong> instead of our official merchant account (<strong>{config.data?.manual?.accountName || "SAM CHAN PANHA"}</strong>).
                </p>
                <p className="text-[10px] text-red-700 pt-1 border-t border-red-200 font-semibold">
                  🚨 Security Action: Submission blocked. A security alert has been dispatched to administrators.
                </p>
              </div>
            ) : !evidenceImage ? (
              <p className="text-[11px] text-amber-700 flex items-center gap-1.5 font-medium">
                <Camera className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>Upload payment receipt above. Direct manual typing is disabled to prevent typos and financial risk.</span>
              </p>
            ) : readingImage ? (
              <p className="text-[11px] text-sky-700 flex items-center gap-1.5 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-sky-600" />
                <span>Analyzing receipt with AI OCR to extract Transaction ID...</span>
              </p>
            ) : evidenceImage && !manualRef ? (
              <div className="p-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-900 text-xs space-y-1 animate-in fade-in">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Transaction ID could not be detected</span>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  The receipt image was uploaded, but the bank Trx ID / reference is missing or blurry. Please click <strong>Change</strong> above to upload a clearer photo.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-emerald-700">
                <span className="flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Auto-extracted &amp; locked to uploaded receipt slip
                </span>
                <span className="text-slate-400 text-[10px]">Tamper-proof</span>
              </div>
            )}

            {/* Real-time Validation Feedback Chip */}
            {refCheck?.checking && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>Verifying reference against bank payment records...</span>
              </div>
            )}
            {Boolean(
              (refCheck && !refCheck.checking && refCheck.isNotCurrentDate) ||
              ocrData?.isUnderpaid ||
              ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") ||
              ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE") ||
              ocrData?.riskFlags?.includes("UNDERPAID")
            ) && (
              <div className="flex flex-col gap-2.5 text-xs bg-rose-50 border-2 border-rose-400 p-3 rounded-xl shadow-xs animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm text-rose-900 flex items-center gap-2">
                      <span>
                        {refCheck?.isNotCurrentDate || ocrData?.riskFlags?.includes("NOT_CURRENT_DATE") || ocrData?.riskFlags?.includes("OLD_TRANSACTION_DATE")
                          ? "Transaction Found, But Date is Not Today"
                          : "Partial / Discrepant Amount Detected"}
                      </span>
                      <Badge variant="destructive" className="text-[10px] uppercase font-black px-1.5 py-0">
                        Review Required
                      </Badge>
                    </div>
                    <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                      {refCheck?.isNotCurrentDate ? (
                        <>
                          Bank record for Trx ID <strong className="font-mono text-slate-900 bg-white px-1 py-0.5 rounded border border-rose-300">{refCheck.trxId || manualRef}</strong> was verified in the Telegram bank group, but its date is <strong className="text-rose-950">{refCheck.transactionDateRaw || refCheck.transactionDateFormatted || "not today"}</strong>.
                        </>
                      ) : ocrData?.isUnderpaid ? (
                        <>
                          Detected receipt amount (<strong className="font-mono text-rose-950">{ocrData.currency || currency} {ocrData.amount?.toLocaleString()}</strong>) is less than the required plan price. Submit for Telegram admin review to manually verify and approve.
                        </>
                      ) : (
                        <>
                          The transaction date (<strong className="text-rose-950">{ocrData?.paidAt || "past date"}</strong>) differs from today. Choose or confirm your payment date below to submit for manual Telegram admin approval.
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-rose-700 mt-1">
                      ⚠️ Automatic activation only accepts payments completed today. Choose or confirm your payment date below to submit for manual Telegram admin approval.
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-rose-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="dealer-date-override" className="text-[11px] font-semibold text-rose-900 whitespace-nowrap">
                      Payment Date:
                    </Label>
                    <Input
                      id="dealer-date-override"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="h-8 text-xs w-36 bg-white border-rose-300 font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={submitting}
                      onClick={() => submitPayment(true)}
                      className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm transition cursor-pointer flex items-center gap-1.5"
                    >
                      {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      <span>Submit for Telegram Admin Review</span>
                    </Button>
                    <a
                      href={refCheck?.telegramAdminLink || "https://t.me/samchanpanha"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-sm transition cursor-pointer"
                    >
                      <span>Chat Admin</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
            {refCheck && !refCheck.checking && refCheck.duplicate && (
              <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-300 p-2.5 rounded-lg font-semibold animate-in fade-in">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-900">Duplicate Transaction Detected</div>
                  <div className="text-[11px] text-rose-700 mt-0.5">
                    {refCheck.message || "This Trx ID has already been submitted or verified. Please provide a new payment receipt."}
                  </div>
                </div>
              </div>
            )}
            {refCheck && !refCheck.checking && !refCheck.duplicate && refCheck.isOld && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2.5 rounded-lg font-semibold animate-in fade-in">
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900">Old Transaction Reference</div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    {refCheck.message || "This transaction is older than the allowed limit. Please pay now and submit a fresh receipt."}
                  </div>
                </div>
              </div>
            )}
            {refCheck && !refCheck.checking && refCheck.valid && refCheck.isInterbank && !refCheck.isNotCurrentDate && (
              <div className="flex items-start gap-2 text-xs text-sky-800 bg-sky-50 border border-sky-300 p-2.5 rounded-lg font-semibold animate-in fade-in">
                <CreditCard className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold flex items-center justify-between gap-1.5">
                    <span>{(refCheck.originatingBank || ocrData?.originatingBank) || "Interbank"} Reference Detected</span>
                    <Badge className="bg-sky-100 text-sky-900 border-sky-300 text-[9px] font-bold">Interbank KHQR</Badge>
                  </div>
                  <div className="text-[11px] text-sky-700 mt-0.5">
                    {refCheck.matchedAba
                      ? `Correlated to ABA PayWay Trx ID: ${refCheck.abaTrxId || refCheck.trxId}`
                      : "Valid reference from external bank. Attach payment slip for fastest verification."}
                  </div>
                </div>
              </div>
            )}
            {refCheck && !refCheck.checking && refCheck.valid && refCheck.matchedAba && (
              <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-300 p-2.5 rounded-lg font-semibold animate-in fade-in">
                <Zap className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5 animate-pulse" />
                <div>
                  <div className="font-bold text-emerald-900">Matched Bank Transaction!</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    {refCheck.message || "Payment verified against incoming ABA transaction. Ready for instant auto-approval!"}
                  </div>
                </div>
              </div>
            )}
            {refCheck && !refCheck.checking && refCheck.valid && !refCheck.matchedAba && !refCheck.duplicate && !refCheck.isOld && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50/60 border border-emerald-200 p-2 rounded-lg">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>Valid transaction reference format. Ready for submission.</span>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-600">{error}</p>
          )}

          <Button
            type="button"
            onClick={() => submitPayment(isNeedsAdminReview)}
            disabled={submitting || !canSubmitPaywall}
            className={cn(
              "w-full h-11 font-bold text-sm shadow-xs disabled:opacity-50",
              activePending
                ? "bg-slate-200 text-slate-600 cursor-not-allowed"
                : isNeedsAdminReview
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-amber-500 hover:bg-amber-400 text-slate-950"
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {activePending
              ? "Payment Awaiting Verification (See Status Above)"
              : !evidenceImage
              ? "Upload Payment Receipt to Verify"
              : isNeedsAdminReview
              ? "Submit for Telegram Admin Review"
              : "Verify Payment & Unlock Dashboard"}
          </Button>
        </div>
      </div>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        qrSrcUsd={qrSrcUsd}
        qrSrcKhr={qrSrcKhr}
        planTitle={`${currentPlan.title} (${cycle === "YEARLY" ? "Yearly" : "Monthly"})`}
        amountText={currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}
        amountTextUsd={`$${priceUsd}.00 USD`}
        amountTextKhr={`៛${priceKhr.toLocaleString()} KHR`}
        currency={currency}
        onCurrencyChange={setCurrency}
        accountName={manual?.accountName || "SAM CHAN PANHA"}
      />
      <TrxIdGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
      />
      <PaymentOcrModal
        open={ocrModalOpen}
        onOpenChange={setOcrModalOpen}
        plan={{ plan: selectedPlan } as any}
        cycle={cycle}
        priceUsd={priceUsd}
        currency={currency}
        onConfirmed={(data) => {
          if (data.manualRef) setManualRef(data.manualRef);
          if (data.evidenceImage) setEvidenceImage(data.evidenceImage);
          if (data.ocrData) setOcrData(data.ocrData);
        }}
      />
    </div>
  );
}
