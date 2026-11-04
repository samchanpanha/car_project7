"use client";

import { useState, useEffect, useMemo, memo } from "react";
import {
  Flame,
  Zap,
  Clock,
  ShieldCheck,
  TrendingDown,
  Tag,
  Sparkles,
  Info,
} from "lucide-react";
import { formatUsd, formatKhr } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PromotionalPricingBannerProps {
  basePriceUsd: number;
  effectivePriceUsd: number;
  isOnSale?: boolean;
  activePriceType?: {
    code: string;
    label: string;
    badgeColor: string;
    mode: string;
  } | null;
  activeItemPrice?: {
    id?: string;
    value?: number;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  discountUsd?: number;
  discountPercent?: number;
  savingsBadgeText?: string;
  floorPriceUsd?: number | null;
  floorEnforced?: boolean;
  className?: string;
}

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
}

export function calculateTimeRemaining(targetDateStr: string | null | undefined): TimeRemaining | null {
  if (!targetDateStr) return null;
  const target = new Date(targetDateStr).getTime();
  if (Number.isNaN(target)) return null;

  const now = Date.now();
  const totalMs = target - now;

  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true };
  }

  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((totalMs / (1000 * 60)) % 60);
  const seconds = Math.floor((totalMs / 1000) % 60);

  return { days, hours, minutes, seconds, totalMs, isExpired: false };
}

export interface PromoCountdownTimerProps {
  endDate?: string | null;
  onExpire?: () => void;
  className?: string;
}

/**
 * Isolated Segmented Digital Pill Countdown Timer.
 * Wrapped in React.memo with internal interval state so that 1-second ticks
 * strictly re-render this badge alone — never parent components or listings.
 * Zero layout shift via monospace tabular-nums in dedicated segmented boxes.
 */
export const PromoCountdownTimer = memo(function PromoCountdownTimer({
  endDate,
  onExpire,
  className,
}: PromoCountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeRemaining | null>(() =>
    calculateTimeRemaining(endDate)
  );

  useEffect(() => {
    if (!endDate) {
      setTimeLeft(null);
      return;
    }

    const initial = calculateTimeRemaining(endDate);
    setTimeLeft(initial);
    if (initial?.isExpired) {
      onExpire?.();
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(endDate);
      setTimeLeft(remaining);
      if (remaining?.isExpired) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endDate, onExpire]);

  if (!timeLeft) return null;

  if (timeLeft.isExpired) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 select-none",
          className
        )}
      >
        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="uppercase tracking-wide text-[11px]">Promotion Ended</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50/90 border border-slate-200/80 rounded-lg px-2.5 py-1 shadow-2xs select-none",
        className
      )}
    >
      {/* Steady static clock icon (no animate-spin to prevent perpetual loading illusion) */}
      <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span className="text-slate-500 text-[11px] uppercase tracking-wide mr-0.5">Ends in:</span>

      {/* Segmented tabular digit boxes with zero layout jitter */}
      <div className="flex items-center gap-1 font-mono text-xs tabular-nums font-bold text-slate-900">
        {timeLeft.days > 0 && (
          <span className="inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded bg-white border border-slate-200/90 shadow-2xs">
            {timeLeft.days}d
          </span>
        )}
        <span className="inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded bg-white border border-slate-200/90 shadow-2xs">
          {String(timeLeft.hours).padStart(2, "0")}h
        </span>
        <span className="font-mono text-xs font-bold text-slate-400 select-none">:</span>
        <span className="inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded bg-white border border-slate-200/90 shadow-2xs">
          {String(timeLeft.minutes).padStart(2, "0")}m
        </span>
        <span className="font-mono text-xs font-bold text-slate-400 select-none">:</span>
        <span className="inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded bg-white border border-slate-200/90 shadow-2xs">
          {String(timeLeft.seconds).padStart(2, "0")}s
        </span>
      </div>
    </div>
  );
});

export function PromotionalPricingBanner({
  basePriceUsd,
  effectivePriceUsd,
  isOnSale = false,
  activePriceType,
  activeItemPrice,
  discountUsd = 0,
  discountPercent = 0,
  savingsBadgeText,
  floorPriceUsd,
  floorEnforced = false,
  className,
}: PromotionalPricingBannerProps) {
  // Determine promo tier icon & theme
  const { TierIcon, glowClass, borderClass, bgGradientClass } = useMemo(() => {
    const code = activePriceType?.code?.toUpperCase() || "";
    if (code.includes("FLASH")) {
      return {
        TierIcon: Zap,
        glowClass: "shadow-orange-500/20",
        borderClass: "border-orange-400/50 hover:border-orange-500",
        bgGradientClass: "from-orange-500/10 via-amber-500/5 to-transparent",
      };
    }
    if (code.includes("HOT")) {
      return {
        TierIcon: Flame,
        glowClass: "shadow-red-500/20",
        borderClass: "border-red-400/50 hover:border-red-500",
        bgGradientClass: "from-red-500/10 via-rose-500/5 to-transparent",
      };
    }
    if (code.includes("CLEARANCE")) {
      return {
        TierIcon: TrendingDown,
        glowClass: "shadow-purple-500/20",
        borderClass: "border-purple-400/50 hover:border-purple-500",
        bgGradientClass: "from-purple-500/10 via-indigo-500/5 to-transparent",
      };
    }
    return {
      TierIcon: Tag,
      glowClass: "shadow-amber-500/20",
      borderClass: "border-amber-400/50 hover:border-amber-500",
      bgGradientClass: "from-amber-500/10 via-yellow-500/5 to-transparent",
    };
  }, [activePriceType?.code]);

  const isEndDatePassed = activeItemPrice?.endDate
    ? new Date(activeItemPrice.endDate).getTime() <= Date.now()
    : false;
  const hasActiveSale = isOnSale && !isEndDatePassed;
  const actualDiscountUsd = discountUsd > 0 ? discountUsd : Math.max(0, basePriceUsd - effectivePriceUsd);
  const actualDiscountPct = discountPercent > 0 ? discountPercent : Math.round((actualDiscountUsd / Math.max(1, basePriceUsd)) * 100);

  // If no active sale, render standard price presentation cleanly
  if (!hasActiveSale) {
    return (
      <div className={cn("mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
        <span className="text-3xl font-extrabold tracking-tight text-slate-900">
          {formatUsd(basePriceUsd)}
        </span>
        <span className="text-sm font-medium text-slate-500">
          {formatKhr(basePriceUsd)}
        </span>
      </div>
    );
  }

  const badgeColor = activePriceType?.badgeColor || "#F97316";

  return (
    <div
      className={cn(
        "relative mt-3.5 overflow-hidden rounded-2xl border p-4 sm:p-5 transition-colors duration-200 shadow-lg",
        borderClass,
        glowClass,
        "bg-white/95 backdrop-blur-xs",
        className
      )}
    >
      {/* Background ambient gradient glow */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br pointer-events-none opacity-80",
          bgGradientClass
        )}
      />

      {/* Top Header: Badge + Isolated Countdown Urgency Banner */}
      <div className="relative flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {/* Steady tier badge icon (no animate-pulse to avoid skeleton loading illusion) */}
          <span
            className="flex h-7 px-2.5 items-center gap-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-white shadow-xs"
            style={{ backgroundColor: badgeColor }}
          >
            <TierIcon className="h-3.5 w-3.5 shrink-0" />
            {activePriceType?.label || "Special Promotion"}
          </span>

          {actualDiscountPct > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/80">
              <Sparkles className="h-3 w-3" />
              {actualDiscountPct}% OFF
            </span>
          )}
        </div>

        {/* Isolated Live Countdown Timer */}
        {activeItemPrice?.endDate && (
          <PromoCountdownTimer endDate={activeItemPrice.endDate} />
        )}
      </div>

      {/* Price Showcase Section */}
      <div className="relative mt-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        {/* Effective Sale Price */}
        <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-amber-600">
          {formatUsd(effectivePriceUsd)}
        </span>

        {/* Struck-through Base Original Price */}
        <span className="text-lg sm:text-xl font-medium text-slate-400 line-through tabular-nums decoration-slate-400/80">
          {formatUsd(basePriceUsd)}
        </span>

        {/* KHR Currency Conversion */}
        <span className="text-sm font-semibold text-slate-500 tabular-nums">
          ({formatKhr(effectivePriceUsd)})
        </span>
      </div>

      {/* Savings Summary Banner */}
      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/70">
          <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
          <span>
            {savingsBadgeText || `You save ${formatUsd(actualDiscountUsd)} (${actualDiscountPct}% discount)`}
          </span>
        </div>

        {/* Floor Price Enforcement Notice */}
        {floorEnforced && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-medium border border-blue-200/70">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span>
              Floor price protected: Dealership minimum guaranteed at {formatUsd(floorPriceUsd || effectivePriceUsd)}
            </span>
          </div>
        )}
      </div>

      {/* Campaign Details Footer */}
      <div className="relative mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>
            Verified promotional listing · Instant reservation eligible
          </span>
        </div>
        {activeItemPrice?.endDate && (
          <span className="text-slate-400">
            Valid until {new Date(activeItemPrice.endDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
