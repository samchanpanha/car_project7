"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Home, Search, PlusCircle, Heart, MessageSquare, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mobile-first bottom navigation (fixed). Header carries desktop actions. */
export function MobileNav() {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const navigate = useAppStore((s) => s.navigate);
  const compareCount = useAppStore((s) => s.compare.length);

  const items = [
    { key: "home", icon: Home, label: t("navHome"), active: view.name === "home", onClick: () => navigate({ name: "home" }) },
    { key: "browse", icon: Search, label: t("navBrowse"), active: view.name === "browse", onClick: () => navigate({ name: "browse" }) },
    { key: "sell", icon: PlusCircle, label: t("navSell"), active: view.name === "sell", onClick: () => navigate({ name: "sell" }), primary: true },
    { key: "favorites", icon: Heart, label: t("navFavorites"), active: view.name === "favorites", onClick: () => navigate({ name: "favorites" }) },
    { key: "messages", icon: MessageSquare, label: t("navMessages"), active: view.name === "messages", onClick: () => navigate({ name: "messages" }) },
  ];

  return (
    <>
      {/* Floating compare pill */}
      {compareCount > 0 && view.name !== "compare" && (
        <button
          onClick={() => navigate({ name: "compare" })}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-950 text-white pl-3 pr-4 py-2.5 shadow-lg border border-slate-700 hover:bg-slate-900 transition-colors cursor-pointer"
          aria-label={`${t("navCompare")} (${compareCount})`}
        >
          <Scale className="h-4 w-4 text-amber-400" aria-hidden />
          <span className="text-sm font-medium">
            {t("navCompare")} ({compareCount})
          </span>
        </button>
      )}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 md:hidden pb-[env(safe-area-inset-bottom)]"
        aria-label="Mobile"
      >
        <div className="grid grid-cols-5">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={it.onClick}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium min-h-[52px] cursor-pointer",
                it.active ? "text-amber-600" : "text-slate-500"
              )}
              aria-current={it.active ? "page" : undefined}
            >
              <it.icon className={cn("h-5 w-5", it.primary && "text-amber-500")} aria-hidden />
              <span className="truncate max-w-[64px]">{it.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
