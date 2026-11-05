"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calculator, Info } from "lucide-react";
import { formatUsd, formatKhr, KHR_PER_USD } from "@/lib/format";

/**
 * Public `/financing` page: an indicative monthly-payment calculator for
 * pre-owned vehicle loans. KhLan does NOT lend or set rates — the calculator is
 * an education/conversion tool to help buyers budget before contacting sellers.
 */
export function FinancingView({ price }: { price?: number }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);

  const [carPrice, setCarPrice] = useState(price && price > 0 ? Math.round(price) : 25000);
  const [downPct, setDownPct] = useState(20);
  const [termMonths, setTermMonths] = useState(48);
  const [rate, setRate] = useState(7.8);

  const loan = Math.max(0, carPrice * (1 - downPct / 100));
  const r = rate / 1200;
  const monthly =
    r === 0
      ? loan / termMonths
      : (loan * r) / (1 - Math.pow(1 + r, -termMonths));
  const totalPaid = monthly * termMonths;
  const totalInterest = Math.max(0, totalPaid - loan);
  const downAmount = carPrice - loan;

  const terms = [24, 36, 48, 60];

  return (
    <div className="bg-slate-50 pb-24 md:pb-12 min-h-screen">
      {/* Hero */}
      <div className="bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 py-14 sm:px-6 text-center space-y-4">
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-3 py-1 text-xs font-semibold rounded-full inline-flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            {t("finBadge")}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("finTitle")}</h1>
          <p className="max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">{t("finSubtitle")}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          {/* Inputs */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-5">
            <h2 className="text-base font-bold text-slate-900">{t("finCalculatorTitle")}</h2>

            <div className="space-y-1.5">
              <Label htmlFor="fin-price" className="text-xs text-slate-600">{t("finPriceLabel")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">$</span>
                <Input
                  id="fin-price"
                  type="number"
                  min={0}
                  value={carPrice}
                  onChange={(e) => setCarPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="pl-7 h-10"
                />
              </div>
              <p className="text-[11px] text-slate-400">≈ {formatKhr(carPrice)}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-600">{t("finDownLabel")}</Label>
                <span className="text-xs font-bold text-slate-800">{downPct}%</span>
              </div>
              <Slider
                min={0}
                max={80}
                step={5}
                value={[downPct]}
                onValueChange={(v) => setDownPct(v[0] ?? 20)}
              />
              <p className="text-[11px] text-slate-400">{t("finDownAmount")}: {formatUsd(downAmount)}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">{t("finTermLabel")}</Label>
              <Select value={String(termMonths)} onValueChange={(v) => setTermMonths(Number(v))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={t("finTermLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m} {t("finMonths")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-600">{t("finRateLabel")}</Label>
                <span className="text-xs font-bold text-slate-800">{rate.toFixed(1)}%</span>
              </div>
              <Slider
                min={3}
                max={20}
                step={0.1}
                value={[rate]}
                onValueChange={(v) => setRate(v[0] ?? 7.8)}
              />
            </div>
          </div>

          {/* Results */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50/70 to-white p-5 sm:p-6 shadow-xs flex flex-col">
            <h2 className="text-base font-bold text-slate-900">{t("finMonthlyPayment")}</h2>
            <div className="mt-3 rounded-xl border border-amber-300 bg-white p-4 text-center">
              <p className="text-3xl sm:text-4xl font-black text-slate-900">{formatUsd(monthly)}</p>
              <p className="mt-1 text-xs text-slate-500">≈ {formatKhr(monthly)} / {t("finMonths").toLowerCase()}</p>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">{t("finLoanAmount")}</dt>
                <dd className="font-semibold text-slate-800">{formatUsd(loan)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">{t("finTotalInterest")}</dt>
                <dd className="font-semibold text-slate-800">{formatUsd(totalInterest)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <dt className="text-slate-500">{t("finTotalPaid")}</dt>
                <dd className="font-bold text-slate-900">{formatUsd(totalPaid)}</dd>
              </div>
            </dl>

            <div className="mt-auto pt-4">
              <Button onClick={() => navigate({ name: "browse" })} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                <Search className="h-4 w-4 mr-2" aria-hidden />
                {t("finCtaBrowse")}
              </Button>
            </div>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs leading-relaxed text-slate-600">{t("finDisclaimer")}</p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <Calculator className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-xs leading-relaxed text-emerald-900">{t("finNote")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
