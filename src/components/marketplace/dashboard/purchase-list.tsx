"use client";

// Purchase request list shared by:
//  - Dealer dashboard leads tab          (url=/api/tenant/purchase-requests, mode=seller)
//  - Customer dashboard sales section    (url=/api/seller/purchase-requests, mode=seller)
//  - Customer dashboard purchases tab    (url=/api/account/purchases,       mode=buyer)

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { apiSend, useFetch } from "@/lib/client-hooks";
import { formatUsd, timeAgo } from "@/lib/format";
import type { PurchaseRequestDTO, PurchaseStatus } from "@/lib/commerce-types";
import { EmptyState, FetchErrorState, PurchaseStatusBadge, errorText, isForbidden } from "./bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Handshake, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALL_STATUSES: PurchaseStatus[] = ["PENDING", "ACCEPTED", "COMPLETED", "CANCELLED", "REJECTED"];

export function PurchaseRequestList({
  url,
  mode,
}: {
  url: string;
  mode: "seller" | "buyer";
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const [status, setStatus] = useState<string>("OPEN");
  const filter = status === "ALL" ? undefined : status === "OPEN" ? undefined : status;
  const listUrl = `${url}${filter ? `?status=${filter}` : ""}`;
  const { data, loading, error, refetch } = useFetch<PurchaseRequestDTO[]>(listUrl);
  const [busyId, setBusyId] = useState<string | null>(null);

  // "OPEN" is a client-side chip that shows PENDING + ACCEPTED
  const items = (data ?? []).filter((p) =>
    status === "ALL" ? true : status === "OPEN" ? p.status === "PENDING" || p.status === "ACCEPTED" : p.status === status,
  );

  const act = async (p: PurchaseRequestDTO, action: "accept" | "reject" | "complete" | "cancel") => {
    setBusyId(p.id);
    const base = mode === "seller" ? url : "/api/account/purchases";
    const endpoint = mode === "seller" ? `${base}/${p.id}` : `${base}/${p.id}`;
    try {
      await apiSend(endpoint, "PATCH", mode === "seller" ? { action } : { action: "cancel" });
      toast.success(t("toastUpdated"));
      refetch();
    } catch (e) {
      toast.error(isForbidden(e) ? t("toastForbidden") : errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const chips = ["OPEN", ...ALL_STATUSES, "ALL"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Handshake className="h-4 w-4" aria-hidden />
          {mode === "seller" ? t("tabSalesRequests") : t("tabPurchases")}
        </h2>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => setStatus(c)}
            aria-pressed={status === c}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              status === c ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {c === "OPEN" ? t("purchaseStatusPENDING") + " + " + t("purchaseStatusACCEPTED")
              : c === "ALL" ? t("anyCondition")
              : t(`purchaseStatus${c}` as never)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : error && !data ? (
        <FetchErrorState message={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Handshake}
          text={mode === "seller" ? t("salesEmpty") : t("purchasesEmpty")}
          hint={mode === "seller" ? t("salesEmptyHint") : t("purchasesEmptyHint")}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
              <button
                onClick={() => navigate({ name: "detail", vehicleId: p.vehicle.id })}
                className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 cursor-pointer"
                aria-label={`${p.vehicle.make} ${p.vehicle.model} ${p.vehicle.year}`}
              >
                {p.vehicle.thumbnail ? (
                  <img src={p.vehicle.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {p.vehicle.make} {p.vehicle.model} {p.vehicle.year}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {t("purchasePriceAtRequest")}: {formatUsd(p.priceUsd)}
                  {" · "}{mode === "seller" ? `${t("purchaseBuyer")}: ${p.buyer?.name ?? "—"}` : `${t("purchaseSeller")}: ${p.sellerName ?? "—"}`}
                  {" · "}{timeAgo(p.createdAt, locale)}
                </p>
                {p.message && <p className="mt-1 truncate rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1 text-xs italic text-slate-500">“{p.message}”</p>}
                {p.decisionNote && (
                  <p className="mt-1 truncate text-[11px] text-rose-500">
                    {p.decisionNote === "Vehicle sold to another buyer" ? t("purchaseSoldNote") : p.decisionNote}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <PurchaseStatusBadge status={p.status} />
                {mode === "seller" ? (
                  <>
                    {p.status === "PENDING" && (
                      <>
                        <Button variant="outline" size="sm" disabled={busyId === p.id} onClick={() => act(p, "accept")}
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                          {t("purchaseAccept")}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => act(p, "reject")}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                          {t("purchaseReject")}
                        </Button>
                      </>
                    )}
                    {p.status === "ACCEPTED" && (
                      <>
                        <Button variant="outline" size="sm" disabled={busyId === p.id} onClick={() => act(p, "complete")}
                          className="border-teal-200 text-teal-700 hover:bg-teal-50" title={t("purchaseCompleteHint")}>
                          {t("purchaseComplete")}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => act(p, "cancel")}
                          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                          {t("purchaseCancelReq")}
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  p.status === "PENDING" && (
                    <Button variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => act(p, "cancel")}
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                      {t("purchaseCancelReq")}
                    </Button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {mode === "seller" && (
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <MoreHorizontal className="h-3 w-3" aria-hidden />
          {t("purchaseCompleteHint")}
        </p>
      )}
    </div>
  );
}
