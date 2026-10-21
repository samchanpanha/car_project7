"use client";

// Seller-side subscription payment flow — Manual KHQR only.
// The seller sees the Super Admin's KHQR, pays with their banking app,
// sends the payment proof via the admin's Telegram contact, and submits the
// bank transaction reference. The subscription activates only after the
// Super Admin verifies the request (AWAITING_VERIFICATION → VERIFIED).

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { apiSend, useFetch } from "@/lib/client-hooks";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send, ExternalLink, QrCode, MessageCircle, ClipboardList, ShieldOff } from "lucide-react";
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
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");

  // reset on open
  useEffect(() => {
    if (open) {
      setManualRef("");
      setEvidenceUrl("");
      setNote("");
      setCreating(false);
    }
  }, [open]);

  const submitManual = async () => {
    if (manualRef.trim().length < 4) return;
    setCreating(true);
    try {
      await apiSend<{ payment: SubscriptionPaymentDTO }>(
        "/api/tenant/payments", "POST",
        {
          plan: plan!.plan, billingCycle: cycle,
          manualRef: manualRef.trim(),
          evidenceUrl: evidenceUrl.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
      toast.success(t("payManualSubmitted"));
      onDone();
      setTimeout(() => onOpenChange(false), 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setCreating(false);
    }
  };

  const manual = config.data?.manual;
  const tgLink = manual?.telegram
    ? `https://t.me/${manual.telegram.replace(/^@/, "")}`
    : null;
  const disabled = config.data ? !config.data.enabled : false;

  const steps = [
    { icon: QrCode, text: t("payStepPay") },
    { icon: MessageCircle, text: t("payStepTelegram") },
    { icon: ClipboardList, text: t("payStepSubmit") },
  ];

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

            {manual?.khqrDataUrl ? (
              <div className="text-center">
                <img src={manual.khqrDataUrl} alt={t("payScanQr")} className="mx-auto h-48 w-48 rounded-xl border border-slate-200 bg-white p-2" />
                <p className="mt-1 text-xs font-medium text-slate-500">{t("payScanQr")}</p>
              </div>
            ) : manual?.hasKhqr && manual.khqrDataUrl === null ? (
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
            <div>
              <Label htmlFor="pay-ref" className="text-xs text-slate-500">{t("payBankRefLabel")} *</Label>
              <Input id="pay-ref" value={manualRef} onChange={(e) => setManualRef(e.target.value)}
                placeholder={t("payBankRefPlaceholder")} className="mt-1.5 h-9" maxLength={80} />
              <p className="mt-1 text-[11px] text-slate-400">{t("payBankRefHint")}</p>
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
              <Button size="sm" onClick={submitManual} disabled={creating || manualRef.trim().length < 4}
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
                <span className="text-[10px] font-normal text-slate-400">
                  {t("payMethodManual")}
                </span>
              </p>
              <p className="truncate text-[11px] text-slate-400">
                <code className="mr-1">{p.reference}</code>
                {p.manualRef ? `· ${t("payManualRef")}: ${p.manualRef}` : ""}
                {" · "}{timeAgo(p.createdAt, locale)}
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
