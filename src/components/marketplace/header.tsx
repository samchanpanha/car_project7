"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Heart, MessageSquare, Scale, Plus, Languages, CarFront } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function LangToggle({ dark }: { dark?: boolean }) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  return (
    <div
      className={cn(
        "flex items-center rounded-full border p-0.5 text-xs font-medium",
        dark ? "border-white/20 text-white/80" : "border-slate-200 text-slate-600"
      )}
      role="group"
      aria-label="Language / ភាសា"
    >
      {(["en", "km"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors cursor-pointer",
            locale === l
              ? "bg-amber-500 text-slate-950"
              : dark
                ? "hover:text-white"
                : "hover:text-slate-900"
          )}
          aria-pressed={locale === l}
        >
          {l === "en" ? "EN" : "ខ្មែរ"}
        </button>
      ))}
      <Languages className="sr-only" aria-hidden />
    </div>
  );
}

export function Header() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const compareCount = useAppStore((s) => s.compare.length);
  const favoritesCount = useAppStore((s) => s.favorites.length);
  const [q, setQ] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ name: "browse", q: q.trim() || undefined });
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950 text-white shadow-sm" role="banner">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
        {/* Logo */}
        <button
          onClick={() => navigate({ name: "home" })}
          className="flex items-center gap-2 shrink-0 cursor-pointer"
          aria-label={t("navHome")}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
            <CarFront className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">
            ខ្លាន <span className="hidden sm:inline text-amber-400">KhLan</span>
          </span>
        </button>

        {/* Search (desktop) */}
        <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-md ml-4" role="search">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9 h-9 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 rounded-full"
              aria-label={t("searchButton")}
            />
          </div>
        </form>

        <div className="flex-1 md:hidden" />

        {/* Actions */}
        <nav className="flex items-center gap-1.5" aria-label="Main">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ name: "compare" })}
            className="hidden lg:inline-flex text-white/80 hover:text-white hover:bg-slate-800 relative"
          >
            <Scale className="h-4 w-4 mr-1.5" aria-hidden />
            {t("navCompare")}
            {compareCount > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 bg-amber-500 text-slate-950 hover:bg-amber-500">
                {compareCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ name: "favorites" })}
            className="hidden md:inline-flex text-white/80 hover:text-white hover:bg-slate-800 relative"
          >
            <Heart className="h-4 w-4 mr-1.5" aria-hidden />
            {t("navFavorites")}
            {favoritesCount > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 bg-amber-500 text-slate-950 hover:bg-amber-500">
                {favoritesCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ name: "messages" })}
            className="hidden md:inline-flex text-white/80 hover:text-white hover:bg-slate-800"
          >
            <MessageSquare className="h-4 w-4 mr-1.5" aria-hidden />
            {t("navMessages")}
          </Button>
          <LangToggle dark />
          <Button
            size="sm"
            onClick={() => navigate({ name: "sell" })}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-full"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden />
            <span className="hidden sm:inline">{t("navSell")}</span>
            <span className="sm:hidden">{t("navSell")}</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
