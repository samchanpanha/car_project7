"use client";

// DashboardShell — responsive layout shared by Admin / Dealer / Customer dashboards.
// Sidebar nav on md+ (sticky, w-56), horizontal scrollable tab bar on mobile.

import { useT } from "@/hooks/use-t";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface DashboardTabDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function DashboardShell({
  greeting,
  subtitle,
  badge,
  tabs,
  active,
  onTab,
  children,
}: {
  greeting: string;
  subtitle: string;
  badge: React.ReactNode;
  tabs: DashboardTabDef[];
  active: string;
  onTab: (id: string) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:pb-10" data-testid="dashboard-shell">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{greeting}</h1>
        {badge}
      </header>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

      <div className="mt-5 grid gap-5 md:grid-cols-[224px_1fr] md:gap-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:block" aria-label={t("navDashboard")}>
          <nav className="sticky top-20 w-56 space-y-1 rounded-xl border border-slate-200 bg-white p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === active;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer min-h-[44px]",
                    isActive
                      ? "bg-amber-50 text-amber-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-amber-600" : "text-slate-400")} aria-hidden />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile tab bar (horizontal scroll) */}
        <div className="md:hidden -mx-4 overflow-x-auto px-4 pb-1 kl-scroll" role="tablist" aria-label={t("navDashboard")}>
          <div className="flex w-max gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === active;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onTab(tab.id)}
                  className={cn(
                    "flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                    isActive
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <main className="min-w-0 space-y-5" aria-live="polite">
          {children}
        </main>
      </div>
    </div>
  );
}
