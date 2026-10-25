"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { formatKhr, formatMileage, formatUsd, timeAgo } from "@/lib/format";
import {
  bodyTypeLabels,
  fuelLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
  partConditionLabels,
  transmissionLabels,
} from "@/lib/i18n";
import type { VehicleCardDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCheck, CarFront, Eye, FileCheck2, Heart, Scale, MapPin, Sparkles, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiSend } from "@/lib/client-hooks";

export function VehicleCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function VehicleCard({ vehicle, showCompare = true }: { vehicle: VehicleCardDTO; showCompare?: boolean }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
  const favorites = useAppStore((s) => s.favorites);
  const setFavorites = useAppStore((s) => s.setFavorites);
  const toggleFavoriteLocal = useAppStore((s) => s.toggleFavoriteLocal);
  const compare = useAppStore((s) => s.compare);
  const toggleCompare = useAppStore((s) => s.toggleCompare);

  const isFav = favorites.includes(vehicle.id);
  const inCompare = compare.includes(vehicle.id);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGuest(me)) {
      toast.info(t("authRequiredToast"));
      navigate({ name: "auth", tab: "signup" });
      return;
    }
    // optimistic
    toggleFavoriteLocal(vehicle.id);
    try {
      if (isFav) {
        await apiSend(`/api/favorites?vehicleId=${vehicle.id}`, "DELETE");
      } else {
        await apiSend("/api/favorites", "POST", { vehicleId: vehicle.id });
        toast.success(locale === "km" ? "បានរក្សាទុកក្នុងចំណូលចិត្ត" : "Saved to favorites");
      }
      const res = await fetch("/api/favorites");
      const json = await res.json();
      setFavorites(json.vehicleIds ?? []);
    } catch {
      toggleFavoriteLocal(vehicle.id); // revert on failure
      toast.error(t("errorGeneric"));
    }
  };

  const sellerLabel =
    vehicle.seller.type === "DEALER"
      ? vehicle.seller.shopName || vehicle.seller.name
      : vehicle.seller.name;

  return (
    <article
      onClick={() => navigate({ name: "detail", vehicleId: vehicle.id })}
      className="group rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer focus-within:ring-2 focus-within:ring-amber-500"
      tabIndex={0}
      role="button"
      aria-label={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ name: "detail", vehicleId: vehicle.id });
        }
      }}
    >
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {vehicle.images[0] ? (
          <img
            src={vehicle.images[0]}
            alt={`${vehicle.make} ${vehicle.model} ${vehicle.year} for sale in ${vehicle.city}`}
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <CarFront className="h-10 w-10" aria-hidden />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          {vehicle.listingCategory === "MOTOR" && (
            <Badge className="bg-sky-600 text-white hover:bg-sky-600 gap-1 text-[10px] shadow-xs">
              🏍️ {locale === "km" ? "ម៉ូតូ" : "Motor"}
            </Badge>
          )}
          {vehicle.listingCategory === "SPARE_PART" && (
            <Badge className="bg-indigo-600 text-white hover:bg-indigo-600 gap-1 text-[10px] shadow-xs">
              ⚙️ {vehicle.partTarget === "MOTOR" ? (locale === "km" ? "គ្រឿងម៉ូតូ" : "Motor Part") : vehicle.partTarget === "CAR" ? (locale === "km" ? "គ្រឿងឡាន" : "Car Part") : (locale === "km" ? "គ្រឿងបន្លាស់" : "Spare Part")}
            </Badge>
          )}
          {vehicle.featured && (
            <Badge className="bg-amber-500 text-slate-950 hover:bg-amber-500 gap-1 shadow-xs">
              <Sparkles className="h-3 w-3" aria-hidden />
              {locale === "km" ? "ពិសេស" : "Featured"}
            </Badge>
          )}
          {vehicle.status === "SOLD" && (
            <Badge className="bg-slate-800 text-white hover:bg-slate-800">{t("soldBadge")}</Badge>
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-1.5">
          {showCompare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!inCompare && compare.length >= 3) {
                  toast.warning(locale === "km" ? "ប្រៀបធៀបបានតែ ៣ ឡាន" : "Compare up to 3 cars");
                  return;
                }
                toggleCompare(vehicle.id);
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow border transition-colors cursor-pointer",
                inCompare ? "border-amber-500 text-amber-600" : "border-slate-200 text-slate-500 hover:text-amber-600"
              )}
              aria-label={t("navCompare")}
              aria-pressed={inCompare}
            >
              <Scale className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            onClick={toggleFavorite}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow border transition-colors cursor-pointer",
              isFav ? "border-rose-200 text-rose-500" : "border-slate-200 text-slate-500 hover:text-rose-500"
            )}
            aria-label={t("navFavorites")}
            aria-pressed={isFav}
          >
            <Heart className={cn("h-4 w-4", isFav && "fill-rose-500 text-rose-500")} aria-hidden />
          </button>
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[15px] leading-snug text-slate-900 line-clamp-1">
            {vehicle.make} {vehicle.model} {vehicle.variant ?? ""}
          </h3>
          {vehicle.trust.reportAvailable && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
              title={t("aiReportReady")}
            >
              <FileCheck2 className="h-3 w-3" aria-hidden />
              AI
            </span>
          )}
        </div>
        {vehicle.priceMasked ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
              <PhoneCall className="h-3 w-3 text-amber-600" />
              {t("contactForPrice")}
            </span>
          </div>
        ) : (
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-bold text-amber-600">{formatUsd(vehicle.priceUsd)}</span>
            <span className="text-xs text-slate-400">{formatKhr(vehicle.priceUsd)}</span>
          </p>
        )}
        {vehicle.listingCategory === "SPARE_PART" ? (
          <div className="mt-1.5 space-y-1 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-[11px]">
                {partCategoryLabels[vehicle.partCategory ?? ""]?.[locale] ?? vehicle.partCategory ?? "Part"}
              </span>
              <span className="text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {partConditionLabels[vehicle.partCondition ?? ""]?.[locale] ?? "Genuine"}
              </span>
              {vehicle.partNumber && (
                <span className="font-mono text-[10px] font-semibold text-slate-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                  OEM: {vehicle.partNumber}
                </span>
              )}
            </div>
            {vehicle.compatibleModels && (
              <p className="text-[11px] text-slate-600 truncate" title={vehicle.compatibleModels}>
                <span className="text-slate-400 mr-1">Fits:</span>{vehicle.compatibleModels}
              </p>
            )}
          </div>
        ) : vehicle.listingCategory === "MOTOR" ? (
          <p className="mt-1.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{vehicle.year}</span>
            <span aria-hidden>·</span>
            <span>{formatMileage(vehicle.mileageKm, locale)}</span>
            {vehicle.engineCc && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-sky-700">{vehicle.engineCc} cc</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{motorBodyTypeLabels[vehicle.bodyType]?.[locale] ?? vehicle.bodyType}</span>
            <span aria-hidden>·</span>
            <span>{transmissionLabels[vehicle.transmission]?.[locale] ?? vehicle.transmission}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{vehicle.year}</span>
            <span aria-hidden>·</span>
            <span>{formatMileage(vehicle.mileageKm, locale)}</span>
            <span aria-hidden>·</span>
            <span>{transmissionLabels[vehicle.transmission]?.[locale] ?? vehicle.transmission}</span>
            <span aria-hidden>·</span>
            <span>{bodyTypeLabels[vehicle.bodyType]?.[locale] ?? vehicle.bodyType}</span>
          </p>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 text-slate-500 min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {vehicle.district ? `${vehicle.district}, ` : ""}
              {vehicle.city}
            </span>
          </span>
          <span className="flex items-center gap-1 text-slate-400 shrink-0">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {vehicle.views}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs text-slate-600 min-w-0">
            <span className="truncate font-medium">{sellerLabel}</span>
            {vehicle.seller.verified && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={t("dealerBadge")} />
            )}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(vehicle.createdAt, locale)}</span>
        </div>
      </div>
    </article>
  );
}
