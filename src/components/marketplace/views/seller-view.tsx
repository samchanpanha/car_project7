"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { SellerPageDTO } from "@/lib/types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { SellerTelegramButtons } from "@/components/marketplace/seller-telegram-buttons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BadgeCheck, CarFront, Gauge, Phone, Send, Star, TriangleAlert, Users } from "lucide-react";

export function SellerView({ userId }: { userId: string }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error } = useFetch<SellerPageDTO>(`/api/sellers/${userId}`);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-10">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center pb-24 md:pb-10">
        <TriangleAlert className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
        <p className="mt-3 text-slate-600">{error || t("errorGeneric")}</p>
      </div>
    );
  }

  const s = data.seller;
  const displayName = s.shopName || s.name;
  const bio = locale === "km" && s.bioKm ? s.bioKm : s.bio;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-10">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => navigate({ name: "home" })}>
        <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden />
        {t("navHome")}
      </Button>

      {/* Seller header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-amber-400">
            {displayName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">{displayName}</h1>
              {s.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  {s.type === "DEALER" ? t("dealerBadge") : t("privateBadge")}
                </span>
              ) : s.verification === "PENDING" ? (
                <Badge variant="outline" className="text-amber-600 border-amber-300">{t("pendingBadge")}</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {s.city} · {t("sellerSince", { y: new Date(s.memberSince).getFullYear() })}
            </p>
            {bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{bio}</p>}
          </div>
          <div className="flex flex-row sm:flex-col gap-4 sm:gap-2 sm:text-right">
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <strong>{s.ratingAvg.toFixed(1)}</strong>
              <span className="text-slate-400">({s.ratingCount})</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <Gauge className="h-4 w-4 text-teal-600" aria-hidden />
              {t("responseRate", { n: s.responseRate })}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <Users className="h-4 w-4 text-slate-400" aria-hidden />
              {t("sellerSince", { y: new Date(s.memberSince).getFullYear() })}
            </span>
          </div>
        </div>
        {(s.phone || s.telegram) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {s.phone && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {s.phone}
              </span>
            )}
            {s.telegram && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                <Send className="h-3.5 w-3.5" aria-hidden />
                Telegram: {s.telegram}
              </span>
            )}
          </div>
        )}
        <SellerTelegramButtons seller={s} className="mt-3" />
      </div>

      {/* Listings */}
      <h2 className="mt-6 text-lg font-bold text-slate-900">
        {t("listingsFrom")} ({data.listings.length})
      </h2>
      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {data.listings.map((v) => (
          <VehicleCard key={v.id} vehicle={v} />
        ))}
      </div>
      {data.listings.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          <CarFront className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-2">—</p>
        </div>
      )}
    </div>
  );
}
