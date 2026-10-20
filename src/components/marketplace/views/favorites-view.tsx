"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch } from "@/lib/client-hooks";
import type { VehiclesResponseDTO } from "@/lib/types";
import { VehicleCard, VehicleCardSkeleton } from "@/components/marketplace/vehicle-card";
import { Button } from "@/components/ui/button";
import { Heart, Search } from "lucide-react";

export function FavoritesView() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const favorites = useAppStore((s) => s.favorites);
  const { data, loading } = useFetch<VehiclesResponseDTO>(
    favorites.length > 0 ? `/api/vehicles?limit=48&sort=newest` : null
  );

  const favItems = (data?.items ?? []).filter((v) => favorites.includes(v.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("favoritesTitle")}</h1>
      {loading && !data ? (
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      ) : favItems.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
          <p className="mt-3 font-medium text-slate-700">{t("noFavorites")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("noFavoritesHint")}</p>
          <Button onClick={() => navigate({ name: "browse" })} className="mt-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
            <Search className="h-4 w-4 mr-2" aria-hidden />
            {t("navBrowse")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {favItems.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}
