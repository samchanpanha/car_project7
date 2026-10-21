"use client";

// Seller-side subscription payment flow.
// Bakong KHQR: creates a PENDING payment, shows the official QR, and polls the
// backend check endpoint (server-side verification only). Without BAKONG_TOKEN
// the option is disabled with a clear notice.
// Manual KHQR: shows the Super Admin-configured KHQR + Telegram contact and
// submits the bank transaction reference → AWAITING_VERIFICATION.

import { useEffect, useRef, useState } from "react";
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
import { QrCode, HandCoins, Loader2, CheckCircle2, Send, XCircle, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Method = "BAKONG" | "MANUAL";

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

  const [method, setMethod] = useState<Method | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<SubscriptionPaymentDTO | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualRef, setManualRef] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // reset on open
  useEffect(() => {
    if (open) {
      setMethod(null);
      setCreated(null);
      setQrDataUrl(null);
      setManualRef("");
      setEvidenceUrl("");
      setNote("");
      setCreating(false);
      setChecking(false);
    }
  }, [open]);

  // stop polling when closed
  useEffect(() => {
    if (!open && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startBakong = async () => {
    setCreating(true);
    try {
      const res = await apiSend<{ payment: SubscriptionPaymentDTO; qrPayload: string | null }>(
        "/api/tenant/payments", "POST",
        { plan: plan!.plan, billingCycle: cycle, method: "BAKONG" },
      );
      setCreated(res.payment);
      setMethod("BAKONG");
      // render the official QR payload via the guarded render endpoint
      const qr = await fetch(`/api/tenant/payments/${res.payment.id}/qr`).then((r) => r.json()).catch(() => null);
      setQrDataUrl(qr?.dataUrl ?? null);
      pollRef.current = setInterval(() => void checkPayment(res.payment.id), 5000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setCreating(false);
    }
  };

  const checkPayment = async (id: string) => {
    try {
      const res = await apiSend<{ status: string }>(`/api/tenant/payments/${id}/check`, "POST");
      if (res.status === "VERIFIED") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        toast.success(t("payVerifiedToast"));
        onDone();
        onOpenChange(false);
      }
    } catch {
      // transient network/API errors — keep polling quietly
    }
  };

  const submitManual = async () => {
    if (manualRef.trim().length < 4) return;
    setCreating(true);
    try {
      const res = await apiSend<{ payment: SubscriptionPaymentDTO }>(
        "/api/tenant/payments", "POST",
        {
          plan: plan!.plan, billingCycle: cycle, method: "MANUAL",
          manualRef: manualRef.trim(),
          evidenceUrl: evidenceUrl.trim() || undefined,
          note: note.trim() || undefined,
        },
      );
      setCreated(res.payment);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payTitle")} — {plan?.plan ?? ""}</DialogTitle>
          <DialogDescription>
            {formatUsd(priceUsd)} · {cycle === "MONTHLY" ? t("billingMonthly") : t("billingYearly")}
          </DialogDescription>
        </DialogHeader>

        {!method && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{t("paySubtitle")}</p>
            <MethodCard
              icon={<QrCode className="h-5 w-5" aria-hidden />}
              title={t("payMethodBakong")}
              desc={t("payMethodBakongDesc")}
              disabled={creating}
              loading={creating}
              unavailable={config.data ? !config.data.bakongConfigured : false}
              unavailableText={t("payBakongUnavailable")}
              onSelect={startBakong}
            />
            <MethodCard
              icon={<HandCoins className="h-5 w-5" aria-hidden />}
              title={t("payMethodManual")}
              desc={t("payMethodManualDesc")}
              disabled={creating}
              loading={false}
              onSelect={() => setMethod("MANUAL")}
            />
          </div>
        )}

        {method === "BAKONG" && (
          <div className="space-y-3 text-center">
            {!created || !qrDataUrl ? (
              <Skeleton className="mx-auto h-56 w-56 rounded-xl" />
            ) : (
              <>
                <img
                  src={qrDataUrl}
                  alt={t("payScanQr")}
                  className="mx-auto h-56 w-56 rounded-xl border border-slate-200 bg-white p-2"
                />
                <p className="text-xs font-medium text-slate-500">{t("payScanQr")}</p>
                <p className="text-xs text-slate-400">{t("payWaitScan")}</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{created.reference}</code>
                  <span className="text-[11px] text-slate-400">{t("payIncludeRef")}</span>
                </div>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" disabled={checking} onClick={async () => { setChecking(true); await checkPayment(created.id); setChecking(false); }}>
                    {checking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden />}
                    {t("payCheckStatus")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                    <XCircle className="h-4 w-4 mr-1.5" aria-hidden />
                    {t("cancel")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {method === "MANUAL" && (
          <div className="space-y-3">
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
              <p className="whitespace-pre-line rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600">
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
              <Button variant="outline" size="sm" onClick={() => setMethod(null)} disabled={creating}>{t("cancel")}</Button>
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

function MethodCard({
  icon, title, desc, onSelect, disabled, loading, unavailable, unavailableText,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onSelect: () => void;
  disabled?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  unavailableText?: string;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled || unavailable}
      aria-label={title}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition-colors cursor-pointer",
        unavailable
          ? "border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed"
          : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{unavailable && unavailableText ? unavailableText : desc}</p>
        </div>
      </div>
    </button>
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
                  {p.method === "BAKONG" ? "Bakong" : t("payMethodManual")}
                </span>
              </p>
              <p className="truncate text-[11px] text-slate-400">
                <code className="mr-1">{p.reference}</code>
                {p.manualRef ? `· ${t("payManualRef")}: ${p.manualRef}` : ""}
                {" · "}{timeAgo(p.createdAt, locale)}
                {p.rejectionReason ? ` · ${t("payRejectedReason")}: ${p.rejectionReason}` : ""}
              </p>
            </div>
            {(p.status === "PENDING" || p.status === "AWAITING_VERIFICATION") && (
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
