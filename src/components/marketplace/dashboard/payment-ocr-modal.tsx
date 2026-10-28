"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Scan,
  Sparkles,
  Clock,
  CreditCard,
  ArrowRight,
  FileText,
  RefreshCw,
  Check,
  Copy,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Send,
  ExternalLink,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fileToDataUrl } from "@/lib/image-client";
import { apiSend } from "@/lib/client-hooks";
import type { PlanDTO } from "@/lib/dashboard-types";
import { arePaymentRefsMatching } from "@/lib/payments/reference";
import { scanReceiptInBrowser } from "@/lib/payments/client-ocr";

interface OcrResponse {
  success: boolean;
  imageHash: string;
  data: {
    trxId: string | null;
    externalRef?: string | null;
    apv: string | null;
    amount: number | null;
    currency: "USD" | "KHR";
    amountUsd: number | null;
    amountKhr: number | null;
    paidAt: string | null;
    paidAtRaw: string | null;
    payerName?: string | null;
    payerAccount?: string | null;
    payee: string | null;
    beneficiaryBank?: string | null;
    bankName: string | null;
    bankCode?: string | null;
    isInterbank?: boolean;
    confidence: number;
    rawText: string;
  };
  verification: {
    status: "PASS" | "WARN" | "MISMATCH";
    confidence: number;
    amountMatch: boolean;
    currencyMatch: boolean;
    isDuplicate: boolean;
    duplicateDetails?: string | null;
    isOld: boolean;
    ageHours?: number | null;
    isNotCurrentDate?: boolean;
    transactionDateFormatted?: string;
    telegramAdmin?: string;
    telegramAdminLink?: string;
    isInterbank?: boolean;
    originatingBank?: string;
    abaTrxId?: string;
    isWrongMerchant?: boolean;
    detectedPayee?: string | null;
    expectedMerchant?: string;
    isUnderpaid?: boolean;
    riskFlags: string[];
    message: string;
  };
}

export function PaymentOcrModal({
  open,
  onOpenChange,
  plan,
  cycle,
  priceUsd,
  currency,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDTO | null;
  cycle: "MONTHLY" | "YEARLY";
  priceUsd: number;
  currency: "USD" | "KHR";
  onConfirmed: (data: {
    manualRef: string;
    evidenceImage: string;
    ocrData: {
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
      detectedPayee?: string;
      expectedMerchant?: string;
      riskFlags: string[];
    };
  }) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>("");
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [result, setResult] = useState<OcrResponse | null>(null);
  const [customRef, setCustomRef] = useState<string>("");
  const [copiedRef, setCopiedRef] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImage(null);
    setScanning(false);
    setScanStep("");
    setScanProgress(0);
    setResult(null);
    setCustomRef("");
    setShowRawText(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processImageFile = async (file: File | undefined) => {
    if (!file) return;
    // Clear previous input & results on new upload
    setCustomRef("");
    setResult(null);
    setImage(null);
    setScanProgress(0);
    try {
      setScanning(true);
      setScanStep("Optimizing image resolution...");
      setScanProgress(15);
      const dataUrl = await fileToDataUrl(file, 1600, 0.9);
      setImage(dataUrl);

      setScanStep("Scanning receipt with Next.js OCR engine...");
      setScanProgress(35);

      let res: OcrResponse;
      try {
        // Primary: Next.js server route handler with Sharp preprocessing and OCR
        res = await apiSend<OcrResponse>("/api/ocr", "POST", {
          image: dataUrl,
          plan: plan?.plan || "PRO",
          cycle,
          currency,
        });
        setScanProgress(100);
      } catch (serverErr) {
        // Fallback: Client-side in-browser Tesseract scanner
        console.warn("Server OCR failed, switching to in-browser scanner:", serverErr);
        setScanStep("Running client-side OCR scanner...");
        const clientRes = await scanReceiptInBrowser(
          dataUrl,
          {
            plan: plan?.plan || "PRO",
            cycle,
            currency,
          },
          (p) => {
            // Map 0..100 to 35..95%
            setScanProgress(Math.round(35 + (p.progress / 100) * 60));
          }
        );
        res = clientRes as unknown as OcrResponse;
        setScanProgress(100);
      }

      setResult(res);
      const detected = res.data.trxId || res.data.externalRef || res.data.apv || "";
      setCustomRef(detected);

      if (res.verification.isWrongMerchant) {
        toast.error("⛔ BLOCKED: Payment slip was not paid to our official KHQR! Security alert sent to admin.");
      } else if (res.verification.status === "PASS") {
        toast.success("✨ Receipt verified successfully! Trx ID extracted.");
      } else if (res.verification.isDuplicate) {
        toast.error("⚠️ Duplicate Trx ID detected!");
      } else if (res.verification.isOld) {
        toast.error("⚠️ Old transaction detected!");
      } else {
        toast.warning(res.verification.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to scan receipt image");
    } finally {
      setScanning(false);
      setScanStep("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadSampleReceipt = async () => {
    try {
      setScanning(true);
      setScanStep("Loading ABA sample receipt...");
      const resp = await fetch("/aba-receipt-sample.svg");
      const blob = await resp.blob();
      const file = new File([blob], "aba-receipt-sample.svg", { type: "image/svg+xml" });
      await processImageFile(file);
    } catch {
      toast.error("Could not load sample receipt");
      setScanning(false);
    }
  };

  const handleConfirm = () => {
    if (!image || !result) return;
    const finalRef = customRef.trim() || result.data.trxId || result.data.externalRef || result.data.apv || "";
    if (!finalRef) {
      toast.error("Transaction reference is required");
      return;
    }

    const refMatch = arePaymentRefsMatching(finalRef, {
      trxId: result.data.trxId,
      externalRef: result.data.externalRef,
      apv: result.data.apv,
      rawText: result.data.rawText,
    });
    if (!refMatch.match) {
      toast.error(`Transaction ID Mismatch! Entered reference "${finalRef}" differs from scanned receipt slip ("${result.data.trxId || "scanned"}"). Because real money is involved, the transaction reference must match.`);
      return;
    }

    if (result.verification.isWrongMerchant) {
      toast.error("⛔ Cannot proceed: Receipt was not paid to our official KHQR account.");
      return;
    }
    if (result.verification.isDuplicate) {
      toast.error("Cannot proceed: This transaction ID has already been used.");
      return;
    }
    if (result.verification.isNotCurrentDate) {
      toast.error(result.verification.message || "Cannot proceed: Transaction date is not today.");
      return;
    }
    if (result.verification.isOld) {
      toast.error("Cannot proceed: This transaction is older than allowed limit.");
      return;
    }
    if (result.verification.status === "MISMATCH") {
      toast.error(result.verification.message || "Cannot proceed: Receipt failed security verification.");
      return;
    }

    onConfirmed({
      manualRef: finalRef,
      evidenceImage: image,
      ocrData: {
        status: result.verification.status,
        confidence: result.verification.confidence,
        trxId: finalRef,
        amount: result.data.amount ?? undefined,
        currency: result.data.currency,
        paidAt: result.data.paidAt ?? undefined,
        rawText: result.data.rawText,
        originatingBank: result.verification.originatingBank || result.data.bankName || undefined,
        isInterbank: Boolean(result.verification.isInterbank || result.data.isInterbank),
        payerName: result.data.payerName || undefined,
        payerAccount: result.data.payerAccount || undefined,
        payee: result.data.payee || undefined,
        abaTrxId: result.verification.abaTrxId || undefined,
        riskFlags: result.verification.riskFlags,
      },
    });
    handleOpenChange(false);
  };

  const copyRefToClipboard = () => {
    if (!customRef) return;
    navigator.clipboard?.writeText(customRef);
    setCopiedRef(true);
    toast.success(`Copied: ${customRef}`);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const requiredAmountStr =
    currency === "USD"
      ? `$${priceUsd.toFixed(2)} USD`
      : `៛${(priceUsd * 4100).toLocaleString()} KHR`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-2 border-emerald-400 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 shrink-0" />

        {/* Dialog Header */}
        <DialogHeader className="px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold">
                <Scan className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  AI Receipt Scanner &amp; Verifier
                  <Sparkles className="h-4 w-4 text-amber-500" />
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Scan bank slip to extract Trx ID &amp; amount, and verify against duplicates &amp; old receipts
                </DialogDescription>
              </div>
            </div>
            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 font-black text-xs uppercase px-2.5 py-1 shrink-0">
              {plan?.plan || "PRO"} · {requiredAmountStr}
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {!image ? (
            /* UPLOAD DROPZONE */
            <div className="space-y-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50/40 cursor-pointer"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm transition group-hover:scale-110">
                  <UploadCloud className="h-7 w-7" />
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                  Drop your payment slip or screenshot here
                </h4>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Supports ABA Mobile, Bakong KHQR, ACLEDA, Wing, Canadia, and all Cambodian bank confirmation screens
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 h-8 text-xs font-semibold border-emerald-400 text-emerald-800 hover:bg-emerald-100/60"
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" />
                  Select Slip Photo
                </Button>
              </div>

              {/* Sample Helper Button */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-2.5 text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Want to test the OCR scanner without paying?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadSampleReceipt}
                  className="h-7 text-xs font-bold text-amber-700 hover:text-amber-800 hover:bg-amber-100/60"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Try Sample ABA Receipt
                </Button>
              </div>
            </div>
          ) : (
            /* IMAGE & OCR RESULTS BREAKDOWN */
            <div className="space-y-4">
              {/* Receipt Preview & Scanning Animation */}
              <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 p-2 overflow-hidden flex items-center justify-center">
                <img
                  src={image}
                  alt="Payment receipt preview"
                  className="max-h-56 w-auto object-contain rounded-lg shadow-sm"
                />

                {/* Scanning Laser Beam Effect */}
                {scanning && (
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none bg-slate-950/60 backdrop-blur-[2px]">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10B981] animate-bounce" />
                    <div className="p-4 text-center space-y-2.5">
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/95 border border-emerald-400/80 px-4 py-1.5 text-xs font-bold text-emerald-400 shadow-xl">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                        {scanStep || "Scanning receipt with OCR..."}
                        {scanProgress > 0 && <span className="text-emerald-300 ml-1 font-mono">{scanProgress}%</span>}
                      </span>
                      {scanProgress > 0 && (
                        <div className="w-56 mx-auto h-2 bg-slate-800/90 rounded-full overflow-hidden border border-emerald-500/40 p-0.5 shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full shadow-[0_0_8px_#10B981]"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action row to change image */}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                  className="h-7 text-xs text-slate-600 hover:text-slate-900"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Scan Different Image
                </Button>
                {result && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    Confidence: <strong className="text-emerald-700 dark:text-emerald-400">{result.data.confidence}%</strong>
                  </span>
                )}
              </div>

              {/* WRONG MERCHANT SECURITY ALERT BANNER */}
              {result && result.verification.isWrongMerchant && (
                <div className="rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/60 p-4 text-xs space-y-2 shadow-md">
                  <div className="flex items-center gap-2 font-black text-sm text-red-700 dark:text-red-400">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                    <span>⛔ PAYMENT SLIP BLOCKED — NOT PAID TO OUR KHQR</span>
                  </div>
                  <p className="text-xs text-red-900 dark:text-red-200 leading-relaxed font-medium">
                    This slip was paid to <strong className="font-bold underline text-red-700 dark:text-red-300">{result.verification.detectedPayee || result.data.payee || "a foreign merchant"}</strong> instead of our official merchant KHQR account (<strong className="font-bold underline text-emerald-800 dark:text-emerald-300">{result.verification.expectedMerchant || "SAM CHAN PANHA"}</strong>).
                  </p>
                  <div className="pt-2 border-t border-red-200 dark:border-red-800 text-[11px] text-red-800 dark:text-red-300">
                    ⚠️ <strong>Security Action:</strong> The submission has been blocked to protect the marketplace, and a fraud alert was dispatched to Telegram administrators.
                  </div>
                </div>
              )}

              {/* VERIFICATION OUTCOME BANNER */}
              {result && !result.verification.isWrongMerchant && (
                <div
                  className={cn(
                    "rounded-xl border p-3.5 text-xs space-y-1.5 transition-all",
                    result.verification.status === "PASS"
                      ? "border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100"
                      : result.verification.status === "WARN"
                      ? "border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100"
                      : "border-rose-300 bg-rose-50/80 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100",
                  )}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {result.verification.status === "PASS" ? (
                      <>
                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                        <span>Ready &amp; Verified</span>
                      </>
                    ) : result.verification.status === "WARN" ? (
                      <>
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <span>Review Required</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-5 w-5 text-rose-600" />
                        <span>Verification Flagged / Rejected</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed">{result.verification.message}</p>
                  {result.verification.isNotCurrentDate && (
                    <div className="pt-2 border-t border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 mt-2">
                      <span className="text-[11px] font-semibold text-rose-900 dark:text-rose-200">
                        Date is not today. Contact Admin on Telegram:
                      </span>
                      <a
                        href={result.verification.telegramAdminLink || "https://t.me/samchanpanha"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Contact Admin ({result.verification.telegramAdmin || "@samchanpanha"})</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* INTERBANK DETECTION CARD */}
              {result && (result.verification.isInterbank || result.data.isInterbank) && (
                <div className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/40 p-3 text-xs space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-950 dark:text-sky-200 flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      Interbank KHQR Payment Detected
                    </span>
                    <Badge className="bg-sky-100 dark:bg-sky-900 text-sky-900 dark:text-sky-100 border-sky-300 text-[10px] font-bold">
                      {result.verification.originatingBank || result.data.bankName || "Interbank"} &rarr; {result.data.beneficiaryBank || "ABA Bank"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-700 dark:text-slate-300 border-t border-sky-200/60 dark:border-sky-800/50">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Sender Account:</span>
                      <strong className="font-mono">{result.data.payerName || "Customer"} {result.data.payerAccount ? `(${result.data.payerAccount})` : ""}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Bank Slip Reference:</span>
                      <strong className="font-mono">{customRef || result.data.externalRef || "Ext Ref"}</strong>
                    </div>
                  </div>
                  {result.verification.abaTrxId && (
                    <div className="pt-1.5 border-t border-sky-200/80 dark:border-sky-800/60 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Correlated with live ABA PayWay Alert (Trx ID: <code className="font-mono font-extrabold text-slate-900 dark:text-white">{result.verification.abaTrxId}</code>)</span>
                    </div>
                  )}
                </div>
              )}

              {/* EXTRACTED FIELDS GRID */}
              {result && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Trx ID Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold">Bank Trx ID / APV</span>
                      {!result.verification.isDuplicate ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          Unused &amp; Fresh
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                          <XCircle className="h-3 w-3" />
                          Duplicate Trx
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <code className="text-sm font-extrabold font-mono text-slate-900 dark:text-white truncate">
                          {customRef || "Not Detected"}
                        </code>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {customRef && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={copyRefToClipboard}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-900"
                            title="Copy Trx ID"
                          >
                            {copiedRef ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                        <Badge variant="outline" className="text-[9px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-300">
                          Auto-Extracted
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Amount Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold">Amount Paid</span>
                      {result.verification.amountMatch ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          Exact Match
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          Mismatch
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {result.data.amountUsd
                          ? `$${result.data.amountUsd.toFixed(2)} USD`
                          : result.data.amountKhr
                          ? `៛${(result.data.amountKhr ?? 0).toLocaleString()} KHR`
                          : "Unknown"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Req: {requiredAmountStr}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold">Transaction Date</span>
                      {!result.verification.isOld ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          Fresh (&lt; 72h)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                          <Clock className="h-3 w-3" />
                          Expired / Old
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {result.data.paidAtRaw || (result.data.paidAt ? new Date(result.data.paidAt).toLocaleString() : "Date not extracted")}
                    </p>
                  </div>

                  {/* Payee & Bank Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold">Bank / Payee</span>
                      <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400">
                        {result.data.bankName || "Cambodian Bank"}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {result.data.payee || "Payee detected from slip"}
                    </p>
                  </div>
                </div>
              )}

              {/* Raw OCR Text Collapsible */}
              {result && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5">
                  <button
                    type="button"
                    onClick={() => setShowRawText(!showRawText)}
                    className="flex w-full items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <span>View Extracted OCR Text</span>
                    {showRawText ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showRawText && (
                    <pre className="mt-2 max-h-32 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-200 whitespace-pre-wrap">
                      {result.data.rawText || "No raw text available"}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload payment slip"
            onChange={(e) => processImageFile(e.target.files?.[0])}
          />
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={scanning}
            className="cursor-pointer"
          >
            Cancel
          </Button>

          {result && (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={
                scanning ||
                result.verification.isWrongMerchant ||
                result.verification.isDuplicate ||
                result.verification.isOld ||
                result.verification.isNotCurrentDate ||
                !customRef.trim()
              }
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 cursor-pointer shadow-sm"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Apply &amp; Verify Payment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
