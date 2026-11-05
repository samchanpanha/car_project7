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
import { useT } from "@/hooks/use-t";

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
  const t = useT();
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
    toast.success(t("copiedPayeeToast", { name: accountName }));
    setTimeout(() => setCopiedPayee(false), 2000);
  };

  const copyAmount = () => {
    if (!displayAmount) return;
    const cleanNum = displayAmount.replace(/[^0-9.]/g, "");
    navigator.clipboard?.writeText(cleanNum || displayAmount);
    setCopiedAmount(true);
    toast.success(t("copiedAmountToast", { value: cleanNum || displayAmount }));
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const downloadQr = () => {
    const link = document.createElement("a");
    link.href = displayQr;
    link.download = `KHQR-${planTitle || "Payment"}-${activeCurrency}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("downloadedQrToast", { currency: activeCurrency }));
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
              {t("qrZoomTitleFull")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {t("qrZoomDesc")}
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
              {t("officialBakong")} · {t(activeCurrency === "KHR" ? "khmelRiel" : "usDollar")}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {planTitle ?? t("subscriptionTitle")}
            </span>
          </div>

          <div className="relative p-2 bg-white rounded-2xl border border-slate-200/80 shadow-inner">
            <img
              src={displayQr}
              alt={t("enlargedQrAlt", { currency: activeCurrency })}
              className="h-72 w-72 sm:h-96 sm:w-96 md:h-[420px] md:w-[420px] object-contain rounded-xl transition-all"
            />
          </div>

          <div className="mt-4 w-full text-center space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm font-bold text-slate-800">
                {t("payeeLabel")} <span className="text-red-700 font-extrabold">{accountName}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyPayee}
                className="h-6 px-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                {copiedPayee ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                {copiedPayee ? t("copied") : t("copyPayee")}
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
                  {copiedAmount ? t("copied") : t("copyAmount")}
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
            {t("downloadQrImage", { currency: activeCurrency })}
          </Button>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
          {t("qrTip")}
        </p>

        <DialogFooter className="sm:justify-center mt-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto px-8 bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold h-9"
          >
            {t("closeFullSize")}
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
  const t = useT();
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
    toast.success(t("copiedRefToast", { text }));
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
              {t("trxGuideTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {t("trxGuideDesc")}
          </DialogDescription>

          <div className="mt-2 p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-700 shrink-0" />
            <span>
              <strong>{t("autoExtractedTitle")}</strong> {t("autoExtractedBody")}
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
                <span>{t("sampleAbaReceipt")}</span>
                <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">
                  {t("lookForTrx")}
                </Badge>
              </div>
              <div className="p-2 sm:p-3 flex justify-center bg-white">
                <img
                  src="/aba-receipt-sample.svg"
                  alt={t("abaSampleAlt")}
                  className="max-h-[340px] w-auto rounded-lg object-contain shadow-xs border border-slate-100"
                />
              </div>
            </div>

            <div className="rounded-xl border-2 border-amber-400 bg-amber-50/80 p-3 space-y-2">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                {t("validRefs")}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white border border-amber-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("trx15Digit")}</span>
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
                    {t("copy")}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white border border-amber-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("apv6Digit")}</span>
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
                    {t("copy")}
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
                  <h4 className="font-bold text-blue-950">{t("acledaPaying")}</h4>
                  <p className="text-[11px] text-blue-800">
                    {t("acledaLocate")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="flex items-center justify-between rounded-lg bg-white border border-blue-200 p-2.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("refNo11")}</span>
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
                    {t("copy")}
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white border border-blue-200 p-2.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("extTxn8")}</span>
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
                    {t("copy")}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-white/80 p-2.5 border border-blue-200/80 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-blue-950">{t("acledaVerifyTitle")}</p>
                <p>
                  {t("acledaVerifyBody")}
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
                  <h4 className="font-bold text-emerald-950">{t("wingPaying")}</h4>
                  <p className="text-[11px] text-emerald-800">
                    {t("wingLocate")}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 border border-emerald-200 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-emerald-950">{t("tipFastest")}</p>
                <p>
                  {t("tipScanner")}
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
                  <h4 className="font-bold text-sky-950">{t("ucbTitle")}</h4>
                  <p className="text-[11px] text-sky-800">
                    {t("ucbDesc")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white border border-sky-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("refNoFt")}</span>
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
                    {t("copy")}
                  </Button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white border border-sky-200 p-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">{t("extTxn8Hex")}</span>
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
                    {t("copy")}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 border border-sky-200 text-[11px] text-slate-700 space-y-1">
                <p className="font-semibold text-sky-950">{t("automaticExtraction")}</p>
                <p>
                  {t("ucbAutoBody")}
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
                    {t("interbankTitle")}
                  </h4>
                  <p className="text-[11px] text-amber-800">
                    {t("interbankDesc")}
                  </p>
                </div>
                <Badge className="bg-amber-200 text-amber-900 border-amber-300 font-extrabold text-[10px]">
                  {t("banksVerified", { n: filteredBanks.length })}
                </Badge>
              </div>

              {/* Bank Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchBankPlaceholder")}
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
                        {t("lookForLabel")} <strong className="text-slate-800">{bank.refLabel}</strong>
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
                  <span>{t("instantAnyBank")}</span>
                </p>
                <p className="text-[10px] text-slate-600">
                  {t("instantAnyBankBody")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step by step guide */}
        <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="font-bold text-slate-800">{t("threeStepsTitle")}</p>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-600">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
        </div>

        <DialogFooter className="sm:justify-between flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 text-xs h-9"
          >
            {t("closeGuide")}
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
              {t("fillSampleTrx")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
