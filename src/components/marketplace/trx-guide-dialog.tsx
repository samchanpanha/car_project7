"use client";

import { useState } from "react";
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
import { Check, Copy, ExternalLink, HelpCircle, Info, QrCode, Search, Sparkles, X, Zap, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getAllSupportedBanks } from "@/lib/payments/bank-directory";

/**
 * KhqrZoomDialog — Pop up dialog that enlarges the KHQR image
 * so the user can scan it clearly or view account details in large format.
 */
export function KhqrZoomDialog({
  open,
  onOpenChange,
  qrSrc,
  qrSrcUsd,
  qrSrcKhr,
  accountName = "SAM CHAN PANHA",
  amountText,
  amountTextUsd,
  amountTextKhr,
  planTitle,
  currency: initialCurrency = "USD",
  onCurrencyChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrSrc: string;
  qrSrcUsd?: string;
  qrSrcKhr?: string;
  accountName?: string;
  amountText?: string;
  amountTextUsd?: string;
  amountTextKhr?: string;
  planTitle?: string;
  currency?: "USD" | "KHR";
  onCurrencyChange?: (c: "USD" | "KHR") => void;
}) {
  const [internalCurrency, setInternalCurrency] = useState<"USD" | "KHR">(initialCurrency);
  const activeCurrency = onCurrencyChange ? initialCurrency : internalCurrency;

  const [copiedPayee, setCopiedPayee] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const displayQr =
    activeCurrency === "KHR"
      ? (qrSrcKhr || qrSrc)
      : (qrSrcUsd || qrSrc);

  const displayAmount =
    activeCurrency === "KHR"
      ? (amountTextKhr || amountText)
      : (amountTextUsd || amountText);

  const switchCurrency = (c: "USD" | "KHR") => {
    setInternalCurrency(c);
    onCurrencyChange?.(c);
  };

  const copyPayee = () => {
    navigator.clipboard?.writeText(accountName);
    setCopiedPayee(true);
    toast.success(`Copied Payee: ${accountName}`);
    setTimeout(() => setCopiedPayee(false), 2000);
  };

  const copyAmount = () => {
    if (!displayAmount) return;
    const cleanNum = displayAmount.replace(/[^0-9.]/g, "");
    navigator.clipboard?.writeText(cleanNum || displayAmount);
    setCopiedAmount(true);
    toast.success(`Copied Amount: ${cleanNum || displayAmount}`);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const downloadQr = () => {
    const link = document.createElement("a");
    link.href = displayQr;
    link.download = `KHQR-${planTitle || "Payment"}-${activeCurrency}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`KHQR (${activeCurrency}) image downloaded to your device!`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl p-6 text-center max-h-[92vh] overflow-y-auto">
        <DialogHeader className="items-center text-center">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white font-black text-xs shadow-xs">
              KHQR
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
              PayWay by ABA KHQR · Full Scan View
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Enlarged high-resolution QR code for quick scanning with ABA Mobile or any Bakong banking app
          </DialogDescription>

          {/* Currency Switcher in Zoom Dialog */}
          <div className="mt-2 inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold shadow-inner">
            <button
              type="button"
              onClick={() => switchCurrency("USD")}
              className={cn(
                "px-3.5 py-1 rounded-lg transition-all cursor-pointer",
                activeCurrency === "USD"
                  ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs font-extrabold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
              )}
            >
              USD KHQR ($)
            </button>
            <button
              type="button"
              onClick={() => switchCurrency("KHR")}
              className={cn(
                "px-3.5 py-1 rounded-lg transition-all cursor-pointer",
                activeCurrency === "KHR"
                  ? "bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-400 shadow-xs font-extrabold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
              )}
            >
              KHR KHQR (៛)
            </button>
          </div>
        </DialogHeader>

        <div className="my-3 flex flex-col items-center justify-center rounded-2xl border-2 border-red-500/80 bg-white p-5 sm:p-7 shadow-lg">
          <div className="w-full flex items-center justify-between border-b border-slate-100 pb-2 mb-3 px-2">
            <span className="font-extrabold text-xs tracking-wider text-red-600 flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
              OFFICIAL BAKONG KHQR · {activeCurrency === "KHR" ? "KHMER RIEL (៛)" : "US DOLLAR ($)"}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {planTitle ?? "Subscription"}
            </span>
          </div>

          <div className="relative p-2 bg-white rounded-2xl border border-slate-200/80 shadow-inner">
            <img
              src={displayQr}
              alt={`Enlarged KHQR Code (${activeCurrency})`}
              className="h-72 w-72 sm:h-96 sm:w-96 md:h-[420px] md:w-[420px] object-contain rounded-xl transition-all"
            />
          </div>

          <div className="mt-4 w-full text-center space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-bold text-slate-800">
                Payee: <span className="text-red-700 font-extrabold">{accountName}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyPayee}
                className="h-6 px-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                {copiedPayee ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                {copiedPayee ? "Copied" : "Copy Payee"}
              </Button>
            </div>

            {displayAmount && (
              <div className="flex items-center justify-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-sm font-black px-4 py-1 shadow-xs">
                  {displayAmount}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAmount}
                  className="h-7 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-300"
                >
                  {copiedAmount ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copiedAmount ? "Copied" : "Copy Amount"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadQr}
            className="text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            📥 Download {activeCurrency} QR Image to Device
          </Button>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
          💡 Tip: Point your phone camera at this enlarged QR code, or save the image to your gallery and scan with ABA Mobile &gt; QR &gt; Photos.
        </p>

        <DialogFooter className="sm:justify-center mt-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto px-8 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold h-9"
          >
            Close Full Size View
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TrxIdGuideDialog — Visual sample guide showing where to get the Transaction ID
 * on the ABA Mobile receipt or SMS/Telegram alert.
 */
export function TrxIdGuideDialog({
  open,
  onOpenChange,
  onUseSample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseSample?: (trxId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [bankTab, setBankTab] = useState<"ABA" | "ACLEDA" | "WING" | "UCB" | "ALL">("ABA");
  const [searchQuery, setSearchQuery] = useState("");
  const allBanks = getAllSupportedBanks();
  const sampleTrxId = "179264913984347";
  const sampleApv = "135160";
  const sampleAcledaRef = "62956359142";
  const sampleAcledaExt = "6e0973e6";

  const filteredBanks = allBanks.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.nameKm.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q) ||
      b.swiftPrefix.toLowerCase().includes(q)
    );
  });

  const copySample = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    toast.success(`Copied Reference: ${text}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <HelpCircle className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              How to Find Your Bank Reference (Multi-Bank Guide)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            KhLan supports payments from ABA, ACLEDA, Wing, Canadia, and all 20+ Cambodian Bakong member banks.
          </DialogDescription>

          <div className="mt-2 p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              <strong>Auto-Extracted from Receipt:</strong> Direct manual typing is disabled to prevent mistakes and financial risk. Simply upload your confirmation receipt slip and our AI scanner extracts and verifies the Trx ID automatically!
            </span>
          </div>

          {/* Bank Tabs Selector */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setBankTab("ABA")}
              className={cn(
                "py-1.5 rounded-lg transition-all cursor-pointer text-center",
                bankTab === "ABA"
                  ? "bg-white text-slate-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              ABA Mobile
            </button>
            <button
              type="button"
              onClick={() => setBankTab("ACLEDA")}
              className={cn(
                "py-1.5 rounded-lg transition-all cursor-pointer text-center",
                bankTab === "ACLEDA"
                  ? "bg-white text-blue-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              ACLEDA
            </button>
            <button
              type="button"
              onClick={() => setBankTab("WING")}
              className={cn(
                "py-1.5 rounded-lg transition-all cursor-pointer text-center",
                bankTab === "WING"
                  ? "bg-white text-emerald-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              Wing Bank
            </button>
            <button
              type="button"
              onClick={() => setBankTab("UCB")}
              className={cn(
                "py-1.5 rounded-lg transition-all cursor-pointer text-center",
                bankTab === "UCB"
                  ? "bg-white text-sky-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              UCB Bank
            </button>
            <button
              type="button"
              onClick={() => setBankTab("ALL")}
              className={cn(
                "py-1.5 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1",
                bankTab === "ALL"
                  ? "bg-white text-amber-900 shadow-xs font-extrabold"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>All 20+</span>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            </button>
          </div>
        </DialogHeader>

        {/* Tab 1: ABA Mobile */}
        {bankTab === "ABA" && (
          <div className="my-3 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shadow-xs">
              <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between text-xs font-semibold">
                <span>Sample ABA Mobile Receipt</span>
                <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">
                  Look for Trx. ID
                </Badge>
              </div>
              <div className="p-2 sm:p-3 flex justify-center bg-white">
                <img
                  src="/aba-receipt-sample.svg"
                  alt="ABA Transaction ID Sample Guide"
                  className="max-h-[340px] w-auto rounded-lg object-contain shadow-xs border border-slate-100"
                />
              </div>
            </div>

            <div className="rounded-xl border-2 border-amber-400 bg-amber-50/80 p-3 space-y-2">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Valid References from ABA Receipt:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white border border-amber-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">15-Digit Trx ID</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">{sampleTrxId}</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample(sampleTrxId)}
                    className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white border border-amber-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">6-Digit APV Code</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">{sampleApv}</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample(sampleApv)}
                    className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: ACLEDA Bank */}
        {bankTab === "ACLEDA" && (
          <div className="my-3 space-y-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-xs">
                  អេស៊ី
                </div>
                <div>
                  <h4 className="font-bold text-blue-950">Paying via ACLEDA Mobile to ABA KHQR</h4>
                  <p className="text-[11px] text-blue-800">
                    On your ACLEDA transaction slip, locate either reference:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="flex items-center justify-between rounded-lg bg-white border border-blue-200 p-2.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Reference No. (11 Digits)</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">{sampleAcledaRef}</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample(sampleAcledaRef)}
                    className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white border border-blue-200 p-2.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">External Txn Ref (8 Chars)</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">{sampleAcledaExt}</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample(sampleAcledaExt)}
                    className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-white/80 p-2.5 border border-blue-200/80 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-blue-950">⚡ How KhLan Verifies ACLEDA Payments:</p>
                <p>
                  KhLan cross-correlates your ACLEDA Reference with the incoming ABA PayWay Telegram alert (code: <code>ACLBKHPPXXX</code>) using account mask and amount matching.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Wing / Bakong */}
        {bankTab === "WING" && (
          <div className="my-3 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
                  វីង
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950">Paying via Wing Bank or Bakong App</h4>
                  <p className="text-[11px] text-emerald-800">
                    Locate the <strong>Transaction ID</strong> or <strong>Hash</strong> on your payment confirmation screen.
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 border border-emerald-200 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-emerald-950">💡 Tip for Fastest Approval:</p>
                <p>
                  Use the <strong>AI Receipt Scanner</strong> button to upload your Wing or Bakong slip photo directly. Our OCR scanner extracts all reference codes automatically!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: UCB (Union Commercial Bank) */}
        {bankTab === "UCB" && (
          <div className="my-3 space-y-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[#00479d] text-white flex items-center justify-center font-bold text-xs">
                  UCB
                </div>
                <div>
                  <h4 className="font-bold text-sky-950">Union Commercial Bank (UCB / ធនាគារ សហពាណិជ្ជ ភ.អ)</h4>
                  <p className="text-[11px] text-sky-800">
                    UCB payment confirmation slips display <strong>Reference No.</strong> (e.g. <code>FT262967KHCC</code>) and <strong>External Txn Ref</strong>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white border border-sky-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Reference No. (FT...KHCC)</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">FT262967KHCC</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample("FT262967KHCC")}
                    className="h-7 px-2 text-[11px] text-sky-700 hover:bg-sky-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white border border-sky-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">External Txn Ref (8-Hex)</span>
                    <code className="font-mono font-bold text-slate-900 text-xs">ffa673fe</code>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copySample("ffa673fe")}
                    className="h-7 px-2 text-[11px] text-sky-700 hover:bg-sky-50 cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 border border-sky-200 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-sky-950">💡 Automatic Extraction:</p>
                <p>
                  Upload your UCB transfer slip image and our scanner will automatically recognize <strong>Union Commercial Bank (UCB)</strong>, the 100 KHR / USD amount, and correlate it directly to the recipient merchant account!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: All 20+ Cambodian Banks & Bakong Directory */}
        {bankTab === "ALL" && (
          <div className="my-3 space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-amber-950 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    Bakong KHQR Interbank Directory (All 20+ Banks)
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    KhLan verifies payments from every National Bank of Cambodia (NBC) Bakong member institution.
                  </p>
                </div>
                <Badge className="bg-amber-200 text-amber-900 border-amber-300 font-extrabold text-[10px]">
                  {filteredBanks.length} Banks Verified
                </Badge>
              </div>

              {/* Bank Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search bank name (e.g. Prince, Sathapana, Canadia, Chip Mong, FTB)..."
                  className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Scrollable Bank Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {filteredBanks.map((bank) => (
                  <div
                    key={bank.code}
                    className="rounded-lg bg-white border border-slate-200 p-2.5 hover:border-amber-400 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {bank.name}
                        </span>
                        <Badge
                          variant="outline"
                          style={{ borderColor: bank.color, color: bank.color }}
                          className="text-[9px] font-mono font-bold px-1 py-0 shrink-0"
                        >
                          {bank.code}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-slate-500">{bank.nameKm}</p>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">
                        Look for: <strong className="text-slate-800">{bank.refLabel}</strong>
                      </span>
                      <code className="text-[9px] text-slate-400 font-mono">
                        {bank.swiftPrefix}
                      </code>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-white/90 p-2 border border-amber-200 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-amber-950 flex items-center gap-1">
                  <span>⚡ Instant Auto-Approval for Any Bank:</span>
                </p>
                <p className="text-[10px] text-slate-600">
                  When you pay from any banking app to our ABA KHQR, upload your slip via the <strong>AI Receipt Scanner</strong>.
                  Our OCR matches the National Bank Bakong settlement reference automatically!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step by step guide */}
        <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="font-bold text-slate-800">3 Easy Steps to Activate Your Plan:</p>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-600">
            <li>
              Scan and complete payment on <strong>ABA Mobile, ACLEDA, Wing, or any Bakong bank app</strong>.
            </li>
            <li>
              Enter your reference number or upload your payment slip photo to the <strong>AI Receipt Scanner</strong>.
            </li>
            <li>
              Our system verifies your transaction in real-time and activates your subscription immediately!
            </li>
          </ol>
        </div>

        <DialogFooter className="sm:justify-between flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 text-xs h-9"
          >
            Close Guide
          </Button>
          {onUseSample && (
            <Button
              type="button"
              onClick={() => {
                onUseSample(sampleTrxId);
                onOpenChange(false);
              }}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-9 shadow-xs"
            >
              Fill Sample Trx ID
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
