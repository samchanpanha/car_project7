"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { apiSend, authFallbackHeaders, clearAuthFallback } from "@/lib/client-hooks";
import type { PersonaDTO } from "@/lib/dashboard-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProfileDialog } from "@/components/marketplace/profile-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Heart, MessageSquare, Scale, Plus, Languages, CarFront, LayoutDashboard, ChevronDown, UserRound, Settings2, LogOut, LogIn, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/components/marketplace/dashboard/bits";
import { toast } from "sonner";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from "@/lib/i18n";

function LangToggle({ dark }: { dark?: boolean }) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer min-h-[36px]",
            dark
              ? "border-white/20 text-white/80 hover:text-white hover:bg-white/10"
              : "border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          )}
          aria-label={`Language / ភាសា / 语言 / Ngôn ngữ — ${LOCALE_NAMES[locale]}`}
          aria-haspopup="menu"
        >
          <Languages className="h-4 w-4" aria-hidden />
          <span>{LOCALE_SHORT[locale]}</span>
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => setLocale(l)}
            className={cn("gap-2", locale === l && "bg-amber-50")}
            aria-current={locale === l}
          >
            <span className="flex-1 text-sm font-medium text-slate-800">{LOCALE_NAMES[l]}</span>
            {locale === l && <Check className="h-4 w-4 text-amber-600" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_DOT: Record<string, string> = {
  SUPER_ADMIN: "bg-amber-400",
  ADMIN: "bg-rose-400",
  DEALER: "bg-emerald-400",
  SELLER: "bg-teal-400",
  BUYER: "bg-slate-400",
};

/** Header account menu (Task 6-a). Renders a placeholder circle until the
 *  session boots so server and client HTML match (no hydration mismatch).
 *  - Real account (me.authed): profile settings, logout.
 *  - Guest (fresh visitor): prominent Log in / Sign up buttons.
 *  - Demo persona: login entry + the classic persona switcher. */
function AccountMenu() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const me = useAppStore((s) => s.me);
  const [profileOpen, setProfileOpen] = useState(false);

  if (!me) {
    return (
      <span
        className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-slate-800"
        aria-label={t("loading")}
        role="status"
      >
        <UserRound className="h-4 w-4 text-slate-600" aria-hidden />
      </span>
    );
  }

  const switchPersona = async (p: PersonaDTO) => {
    if (p.id === me.user.id) return;
    try {
      await apiSend("/api/session", "POST", { userId: p.id });
      // In cookie-blocked contexts (embedded previews) the persona cookie is
      // refused — verify the switch took effect and fall back to the
      // localStorage persona transported via the x-khlan-persona header.
      const check = await fetch("/api/session", { cache: "no-store", headers: authFallbackHeaders() });
      const s = check.ok ? ((await check.json()) as { user?: { id?: string } }) : null;
      try {
        if (s?.user?.id !== p.id) {
          window.localStorage.setItem("khlan_ls_persona", p.id);
        } else {
          window.localStorage.removeItem("khlan_ls_persona");
        }
      } catch {
        /* ignore */
      }
      try {
        sessionStorage.setItem("khlan_switched", p.name);
      } catch {
        /* ignore */
      }
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    }
  };

  const logout = async () => {
    try {
      await apiSend("/api/auth/logout", "POST");
      // Drop the header-transport fallback too (cookie-blocked sessions).
      clearAuthFallback();
      try {
        sessionStorage.setItem("khlan_loggedout", "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    }
  };

  // ---------- real account ----------
  if (me.authed) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full border border-slate-700 py-1 pl-1 pr-1 transition-colors hover:border-slate-500 hover:bg-slate-900 cursor-pointer min-h-[36px] sm:pr-2.5"
              aria-label={`${me.user.name} — ${t("accountSettings")}`}
            >
              {me.user.avatarUrl ? (
                <img
                  src={me.user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-slate-950">
                  {initials(me.user.name)}
                </span>
              )}
              <span className="hidden lg:block text-left leading-tight">
                <span className="block max-w-[120px] truncate text-xs font-semibold text-white">{me.user.name}</span>
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", ROLE_DOT[me.user.role] ?? "bg-slate-400")} aria-hidden />
                  {me.tenant ? me.tenant.name : t(`role${me.user.role}` as never)}
                </span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="block text-sm font-semibold text-slate-900">{me.user.name}</span>
              <span className="block font-mono text-[11px] font-normal text-slate-500" dir="ltr">
                {me.user.phone}
              </span>
              <span className="block text-[11px] font-normal text-slate-500">
                {me.tenant ? `${me.tenant.name} · ${t(`trole${me.tenant.myRole}` as never)}` : t(`role${me.user.role}` as never)}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {me.telegramLinked && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[9px] font-semibold text-emerald-700">
                    {t("accountTelegramBadge")}
                  </Badge>
                )}
                {me.phoneVerified === false && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] font-semibold text-amber-800">
                    {t("accountUnverifiedBadge")}
                  </Badge>
                )}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setProfileOpen(true)} className="gap-2">
              <Settings2 className="h-4 w-4 text-amber-600" aria-hidden />
              <span className="text-xs font-semibold">{t("accountSettings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="gap-2 text-rose-700 focus:text-rose-700">
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="text-xs font-semibold">{t("accountLogout")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => useAppStore.getState().navigate({ name: "dashboard" })} className="gap-2">
              <LayoutDashboard className="h-4 w-4 text-amber-600" aria-hidden />
              <span className="text-xs font-semibold">{t("navDashboard")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      </>
    );
  }

  // ---------- guest (fresh visitor) or demo mode disabled ----------
  if (isGuest(me) || (!me.authed && me.demoModeEnabled === false) || (!me.authed && me.personas.length === 0)) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => useAppStore.getState().navigate({ name: "auth", tab: "login" })}
          className={cn(
            "h-9 border-white/25 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white",
          )}
          aria-label={t("authLoginTab")}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline sm:ml-1.5">{t("authLoginTab")}</span>
        </Button>
        {me.adminOnlyLogin !== true && (
          <Button
            size="sm"
            onClick={() => useAppStore.getState().navigate({ name: "auth", tab: "signup" })}
            className="h-9 bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
          >
            {t("authSignupTab")}
          </Button>
        )}
      </div>
    );
  }

  // ---------- demo persona mode ----------
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-slate-700 py-1 pl-1 pr-1 transition-colors hover:border-slate-500 hover:bg-slate-900 cursor-pointer min-h-[36px] sm:pr-2.5"
          aria-label={`${me.user.name} — ${t("personaMenuTitle")}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-slate-950">
            {initials(me.user.name)}
          </span>
          <span className="hidden lg:block text-left leading-tight">
            <span className="block max-w-[120px] truncate text-xs font-semibold text-white">{me.user.name}</span>
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <span className={cn("inline-block h-1.5 w-1.5 rounded-full", ROLE_DOT[me.user.role] ?? "bg-slate-400")} aria-hidden />
              {me.tenant ? me.tenant.name : t(`role${me.user.role}` as never)}
            </span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => useAppStore.getState().navigate({ name: "auth" })} className="gap-2">
          <LogIn className="h-4 w-4 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-900">{t("authLoginCta")}</span>
            <span className="block truncate text-[10px] text-slate-400">{t("authLoginCtaHint")}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {t("personaSwitchLabel")}
        </DropdownMenuLabel>
        {me.personas.map((p) => (
          <DropdownMenuItem
            key={p.id}
            disabled={p.id === me.user.id}
            onClick={() => switchPersona(p)}
            className={cn("gap-2", p.id === me.user.id && "bg-amber-50")}
          >
            <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", ROLE_DOT[p.role] ?? "bg-slate-400")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-800">{p.name}</span>
              <span className="block truncate text-[10px] text-slate-400">{p.label[locale] ?? p.label.en}</span>
            </span>
            <Badge variant="outline" className="shrink-0 text-[9px] font-semibold text-slate-500">
              {t(`role${p.role}` as never)}
            </Badge>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[10px] leading-relaxed text-slate-400" role="note">
          {t("authDemoModeNote")}
        </p>
        <DropdownMenuItem onClick={() => useAppStore.getState().navigate({ name: "dashboard" })} className="gap-2">
          <LayoutDashboard className="h-4 w-4 text-amber-600" aria-hidden />
          <span className="text-xs font-semibold">{t("navDashboard")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
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
          {/* Dashboard is an account surface — hide it from guests entirely
              (they get Log in / Sign up instead). Signed-in users always have
              a visible entry: icon-only on small screens, icon + label ≥ lg. */}
          {me && !isGuest(me) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ name: "dashboard" })}
              className="text-white/80 hover:text-white hover:bg-slate-800 border border-slate-700 px-2 sm:px-3"
              aria-label={t("navDashboard")}
            >
              <LayoutDashboard className="h-4 w-4 text-amber-400" aria-hidden />
              <span className="hidden lg:inline ml-1.5">{t("navDashboard")}</span>
            </Button>
          )}
          <LangToggle dark />
          <Button
            size="sm"
            onClick={() => navigate({ name: "sell" })}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-full px-2.5 sm:px-4"
            aria-label={t("navSell")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("navSell")}</span>
          </Button>
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
