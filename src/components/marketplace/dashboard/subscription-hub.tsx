"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { formatUsd } from "@/lib/format";
import type { PlanDTO, TenantDashboardDTO, SubscriptionDTO } from "@/lib/dashboard-types";
import { TENANT_DASHBOARD_ENDPOINT } from "@/lib/dashboard-types";
import { RequestSubscriptionDialog, PendingPaymentBanner } from "./payment-flow";
import { EmptyState, FetchErrorState } from "./bits";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Car, Check, CheckCircle2, ChevronRight, Clock, CreditCard, Flame, HelpCircle,
  Hourglass, LayoutDashboard, Loader2, MapPin, ShieldCheck, Sparkles, Star, Store,
  TriangleAlert, Users, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SubscriptionHub({ isDealer = true }: { isDealer?: boolean }) {
  const t = useT();
  const me = useAppStore((s) => s.me);
  const { data, loading, error, refetch } = useFetch<TenantDashboardDTO>(TENANT_DASHBOARD_ENDPOINT);

  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [requestPlan, setRequestPlan] = useState<PlanDTO | null>(null);
  const [downgrading, setDowngrading] = useState(false);
  const [celebrationModal, setCelebrationModal] = useState<string | null>(null);

  // Listen to live SSE event: When payment is approved, trigger celebration and refetch!
  useRealtimeEvent("SUBSCRIPTION_ACTIVATED", (event) => {
    refetch();
    const planName = (event.payload?.plan as string) || "PRO";
    setCelebrationModal(planName);
  });

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error && !data) return <FetchErrorState message={error} onRetry={refetch} />;

  const sub = data?.subscription ?? null;
  const planTier = (sub?.plan || "FREE").toUpperCase();
  const isPaid = planTier !== "FREE";
  const isExpired = sub?.status === "EXPIRED" || sub?.status === "PAST_DUE";

  // Calculate live quotas
  const publishedListings = data?.stats?.published ?? 0;
  const listingsLimit = sub?.listingsLimit ?? (planTier === "ENTERPRISE" ? 1000 : planTier === "PRO" ? 50 : 15);
  const listingsPct = Math.min(100, Math.round((publishedListings / Math.max(1, listingsLimit)) * 100));

  const activeSeats = data?.members?.filter((m) => m.status === "ACTIVE").length ?? 1;
  const seatsLimit = sub?.seats ?? (planTier === "ENTERPRISE" ? 20 : planTier === "PRO" ? 5 : 1);
  const seatsPct = Math.min(100, Math.round((activeSeats / Math.max(1, seatsLimit)) * 100));

  const branchLimit = planTier === "ENTERPRISE" ? 10 : planTier === "PRO" ? 3 : 1;
  const featuredLimit = sub?.featuredLimit ?? (planTier === "ENTERPRISE" ? 50 : planTier === "PRO" ? 10 : 2);

  // Parse remaining days
  let daysRemaining: number | null = null;
  if (sub?.currentPeriodEnd) {
    const end = new Date(sub.currentPeriodEnd).getTime();
    const now = Date.now();
    daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  const fallbackPlans: PlanDTO[] = [
    {
      plan: "BASIC",
      name: "Basic Dealer",
      priceUsdMonthly: 19,
      priceUsdYearly: 190,
      listingsLimit: 15,
      featuredLimit: 2,
      seats: 2,
      features: [{ en: "Up to 15 car listings", km: "រថយន្តរហូតដល់ ១៥ គ្រឿង" }],
    },
    {
      plan: "PRO",
      name: "Professional Dealership",
      priceUsdMonthly: 49,
      priceUsdYearly: 490,
      listingsLimit: 50,
      featuredLimit: 10,
      seats: 5,
      features: [{ en: "Up to 50 car listings", km: "រថយន្តរហូតដល់ ៥០ គ្រឿង" }],
    },
    {
      plan: "ENTERPRISE",
      name: "Enterprise Network",
      priceUsdMonthly: 149,
      priceUsdYearly: 1490,
      listingsLimit: 1000,
      featuredLimit: 50,
      seats: 20,
      features: [{ en: "Unlimited listings", km: "រថយន្តមិនកំណត់" }],
    },
  ];

  const plans: PlanDTO[] = (data?.plans as unknown as PlanDTO[]) ?? fallbackPlans;

  return (
    <div className="space-y-6">
      {/* Pending Payment Progress Banner */}
      <PendingPaymentBanner />

      {/* Celebration Modal when SSE activates plan */}
      {celebrationModal && (
        <div className="flex items-center justify-between rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-4 shadow-md animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white font-extrabold text-[10px] tracking-wide uppercase px-2 py-0.5">
                  Live Verification Complete
                </Badge>
                <h4 className="text-sm font-bold text-emerald-950">
                  🎉 {celebrationModal} Plan Active!
                </h4>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                Your payment was approved in Telegram. All features are active with zero refresh needed.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCelebrationModal(null)}
            className="h-8 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Soft Grace Period Banner if expired */}
      {isExpired && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs shrink-0">
                <TriangleAlert className="h-5 w-5" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-amber-950">
                  Subscription Grace Period Active
                </h4>
                <p className="text-xs text-amber-800">
                  Your plan expired recently. We have granted a 7-day grace period so your listings and leads remain active. Please renew to avoid interruption.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const pro = plans.find((p) => p.plan === "PRO") || plans[0];
                setRequestPlan(pro);
              }}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-xs cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Renew Subscription
            </Button>
          </div>
        </div>
      )}

      {/* Plan Header & Quota Visual Gauges */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Current Plan: {planTier}
                </h3>
                <Badge
                  className={cn(
                    "text-[11px] font-bold px-2 py-0.5",
                    isPaid ? "bg-amber-500 text-slate-950" : "bg-slate-100 text-slate-700",
                  )}
                >
                  {isPaid ? "Active Tier" : "Free Starter"}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                {daysRemaining !== null ? (
                  <span>
                    Renews in <b>{daysRemaining} days</b> ({sub?.billingCycle === "YEARLY" ? "Yearly billing" : "Monthly billing"})
                  </span>
                ) : (
                  "Standard Starter Plan with basic listing capacity"
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setCycle("MONTHLY")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                cycle === "MONTHLY" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("YEARLY")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1",
                cycle === "YEARLY" ? "bg-amber-500 text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900",
              )}
            >
              Yearly
              <span className="rounded-full bg-emerald-600 px-1 text-[9px] font-extrabold text-white">
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* 4 Real-Time Quota Meters */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2">
          {/* Listings Meter */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Car className="h-3.5 w-3.5 text-blue-600" />
                Active Inventory
              </span>
              <span className="font-bold text-slate-900 font-mono">
                {publishedListings} / {listingsLimit}
              </span>
            </div>
            <Progress value={listingsPct} className="h-2" />
            <p className="text-[10px] text-slate-500">
              {listingsLimit - publishedListings} listings remaining
            </p>
          </div>

          {/* Featured Slots Meter */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                Featured Slots
              </span>
              <span className="font-bold text-slate-900 font-mono">
                {featuredLimit} Max
              </span>
            </div>
            <Progress value={Math.min(100, (featuredLimit / 50) * 100)} className="h-2" />
            <p className="text-[10px] text-slate-500">
              High visibility spots on homepage
            </p>
          </div>

          {/* Team Seats Meter */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Users className="h-3.5 w-3.5 text-indigo-600" />
                Staff Seats
              </span>
              <span className="font-bold text-slate-900 font-mono">
                {activeSeats} / {seatsLimit}
              </span>
            </div>
            <Progress value={seatsPct} className="h-2" />
            <p className="text-[10px] text-slate-500">
              {seatsLimit - activeSeats} seats available to invite
            </p>
          </div>

          {/* Branches Meter */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Store className="h-3.5 w-3.5 text-emerald-600" />
                Showroom Branches
              </span>
              <span className="font-bold text-slate-900 font-mono">
                {branchLimit} Max
              </span>
            </div>
            <Progress value={Math.min(100, (branchLimit / 10) * 100)} className="h-2" />
            <p className="text-[10px] text-slate-500">
              Branch locations across cities
            </p>
          </div>
        </div>
      </div>

      {/* Plan Upgrade & Comparison Cards */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-900">
          Available Subscription Plans
        </h4>

        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = planTier === p.plan && !isExpired;
            const price = cycle === "MONTHLY" ? p.priceUsdMonthly : p.priceUsdYearly;
            const features = p.features ?? [];

            return (
              <div
                key={p.plan}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border p-5 transition-all",
                  isCurrent
                    ? "border-amber-400 bg-amber-50/20 shadow-md ring-2 ring-amber-400/30"
                    : "border-slate-200 bg-white hover:border-slate-300 shadow-xs",
                )}
              >
                {p.plan === "PRO" && (
                  <span className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-xs">
                    Most Popular
                  </span>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-base font-bold text-slate-900">{p.name}</h5>
                    {isCurrent && (
                      <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">
                        Current Plan
                      </Badge>
                    )}
                  </div>

                  <div>
                    <span className="text-2xl font-black text-slate-900">
                      {formatUsd(price || 0)}
                    </span>
                    <span className="text-xs text-slate-500">
                      /{cycle === "MONTHLY" ? "month" : "year"}
                    </span>
                  </div>

                  <ul className="space-y-1.5 pt-2 text-xs text-slate-600 border-t border-slate-100">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span><b>{p.listingsLimit}</b> car listings</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span><b>{p.featuredLimit ?? 0}</b> featured spots</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span><b>{p.seats ?? 1}</b> staff seats</span>
                    </li>
                    {p.plan !== "BASIC" && (
                      <li className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Telegram CRM & Lead Bot</span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="pt-5">
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="w-full text-xs font-semibold bg-slate-50 text-slate-500"
                    >
                      Active Plan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setRequestPlan(p)}
                      className={cn(
                        "w-full text-xs font-bold shadow-xs cursor-pointer",
                        p.plan === "PRO"
                          ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                          : "bg-slate-900 hover:bg-slate-800 text-white",
                      )}
                    >
                      Upgrade to {p.plan}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrade / Payment Request Dialog */}
      {requestPlan && (
        <RequestSubscriptionDialog
          open={Boolean(requestPlan)}
          onOpenChange={(o) => !o && setRequestPlan(null)}
          plan={requestPlan}
          cycle={cycle}
          priceUsd={cycle === "MONTHLY" ? requestPlan.priceUsdMonthly : requestPlan.priceUsdYearly}
          onDone={() => {
            setRequestPlan(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
