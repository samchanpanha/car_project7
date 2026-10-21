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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Send, ExternalLink, QrCode, ClipboardList, ShieldOff,
  Camera, CheckCircle2, Clock, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [creating, setCreating] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [readingImage, setReadingImage] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
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
      await apiSend<{ payment: SubscriptionPaymentDTO; waitMinutes: number }>(
        "/api/tenant/payments", "POST",
        {
          plan: plan!.plan, billingCycle: cycle,
          manualRef: manualRef.trim() || undefined,
          evidenceImage: evidenceImage ?? undefined,
          evidenceUrl: evidenceUrl.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
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
  const qrSrc = manual?.khqrImage ?? manual?.khqrDataUrl ?? null;
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
          <DialogTitle>{t("payTitle")} — {plan?.plan ?? ""}</DialogTitle>
          <DialogDescription>
            {formatUsd(priceUsd)} · {cycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}
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
                <img src={qrSrc} alt={t("payScanQr")} className="mx-auto h-48 w-48 rounded-xl border border-slate-200 bg-white object-contain p-2" />
                <p className="mt-1 text-xs font-medium text-slate-500">{t("payScanQr")}</p>
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
              <Label htmlFor="pay-ref" className="text-xs text-slate-500">{t("payBankRefLabel")}</Label>
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
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
