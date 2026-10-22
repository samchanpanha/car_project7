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
import { Check, Copy, ExternalLink, HelpCircle, Info, QrCode, Sparkles, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * KhqrZoomDialog — Pop up dialog that enlarges the KHQR image
 * so the user can scan it clearly or view account details in large format.
 */
export function KhqrZoomDialog({
  open,
  onOpenChange,
  qrSrc,
  accountName = "SAM CHAN PANHA",
  amountText,
  planTitle,
  currency = "USD",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrSrc: string;
  accountName?: string;
  amountText?: string;
  planTitle?: string;
  currency?: "USD" | "KHR";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 text-center">
        <DialogHeader className="items-center text-center">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-amber-600" />
            <DialogTitle className="text-base font-bold text-slate-900">
              PayWay by ABA KHQR · Full Size
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Scan directly with ABA Mobile or any banking app supporting Bakong
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 flex flex-col items-center justify-center rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-sm">
          <img
            src={qrSrc}
            alt="Enlarged KHQR Code"
            className="h-72 w-72 sm:h-80 sm:w-80 object-contain rounded-xl"
          />

          <div className="mt-3 text-center space-y-1">
            <p className="text-sm font-bold text-slate-900">
              Payee: <span className="text-amber-800">{accountName}</span>
            </p>
            {amountText && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-black px-3 py-1">
                {amountText}
              </Badge>
            )}
            {planTitle && (
              <p className="text-xs text-slate-500 font-medium">
                For {planTitle} ({currency})
              </p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          💡 You can scan this code with another phone, or take a screenshot to upload directly into your banking app.
        </p>

        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold h-9"
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
  const sampleTrxId = "179264913984347";
  const sampleApv = "135160";

  const copySample = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    toast.success(`Copied Trx ID: ${text}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
              <HelpCircle className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900">
              How to Find Your Bank Transaction ID (Trx ID)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Our automated banking integration checks for this reference to activate your plan in seconds.
          </DialogDescription>
        </DialogHeader>

        {/* Visual Sample Graphic */}
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
                className="max-h-[380px] w-auto rounded-lg object-contain shadow-xs border border-slate-100"
              />
            </div>
          </div>

          {/* Quick Copyable Reference Box */}
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Example References from ABA Receipt:
              </span>
              <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900 text-[10px] font-bold">
                Accepted by KhLan
              </Badge>
            </div>

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
                  onClick={() => {
                    copySample(sampleTrxId);
                    onUseSample?.(sampleTrxId);
                  }}
                  className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50 cursor-pointer"
                >
                  {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copied ? "Copied" : "Use Sample"}
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
                  onClick={() => {
                    copySample(sampleApv);
                    onUseSample?.(sampleApv);
                  }}
                  className="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50 cursor-pointer"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Use APV
                </Button>
              </div>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="font-bold text-slate-800">3 Easy Steps to Find Your Trx ID:</p>
            <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-600">
              <li>
                Scan and complete payment on <strong>ABA Mobile</strong> or any Bakong banking app.
              </li>
              <li>
                On the payment completion receipt, locate the <strong>Trx. ID</strong> (15 digits) or <strong>APV</strong> (6 digits).
              </li>
              <li>
                Enter or paste that number into the <strong>Bank Transaction Reference</strong> field. Your subscription activates automatically in seconds!
              </li>
            </ol>
          </div>
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
