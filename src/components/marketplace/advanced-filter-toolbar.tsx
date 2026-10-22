"use client";

import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, X, ArrowUpDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export interface AdvancedFilterValues {
  q?: string;
  status?: string;
  branchId?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
}

interface AdvancedFilterToolbarProps {
  values: AdvancedFilterValues;
  onChange: (next: AdvancedFilterValues) => void;
  statusOptions?: FilterOption[];
  branchOptions?: FilterOption[];
  sortOptions?: FilterOption[];
  searchPlaceholder?: string;
  totalResults?: number;
  className?: string;
}

const DEFAULT_SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "views", label: "Most Viewed" },
  { value: "year_desc", label: "Year: Newest" },
];

export function AdvancedFilterToolbar({
  values,
  onChange,
  statusOptions,
  branchOptions,
  sortOptions = DEFAULT_SORT_OPTIONS,
  searchPlaceholder = "Search make, model, VIN...",
  totalResults,
  className,
}: AdvancedFilterToolbarProps) {
  const t = useT();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeFilterCount =
    (values.q ? 1 : 0) +
    (values.status && values.status !== "ALL" ? 1 : 0) +
    (values.branchId && values.branchId !== "ALL" ? 1 : 0) +
    (values.priceMin ? 1 : 0) +
    (values.priceMax ? 1 : 0);

  const handleReset = () => {
    onChange({
      q: "",
      status: "ALL",
      branchId: "ALL",
      priceMin: "",
      priceMax: "",
      sort: "newest",
    });
  };

  return (
    <div className={cn("space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-xs", className)}>
      {/* Primary search & quick status row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={values.q || ""}
            onChange={(e) => onChange({ ...values, q: e.target.value })}
            placeholder={searchPlaceholder}
            className="h-9 pl-9 pr-8 text-xs bg-slate-50/50 focus-visible:bg-white"
          />
          {values.q && (
            <button
              type="button"
              onClick={() => onChange({ ...values, q: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="w-[160px] shrink-0">
          <Select
            value={values.sort || "newest"}
            onValueChange={(sort) => onChange({ ...values, sort })}
          >
            <SelectTrigger className="h-9 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400 shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Toggle Filters Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced((v) => !v)}
          className={cn(
            "h-9 text-xs gap-1.5",
            showAdvanced || activeFilterCount > 0
              ? "border-amber-400 bg-amber-50 text-amber-900"
              : "text-slate-700",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-amber-200 text-amber-900 font-bold">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9 text-xs text-slate-500 hover:text-rose-600"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Quick Status pills if provided */}
      {statusOptions && statusOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {statusOptions.map((opt) => {
            const active = (values.status || "ALL") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...values, status: opt.value })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-amber-500 text-slate-950 font-semibold shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70",
                )}
              >
                {opt.label}
              </button>
            );
          })}
          {totalResults !== undefined && (
            <span className="ml-auto text-[11px] text-slate-400 font-mono">
              {totalResults} {totalResults === 1 ? "result" : "results"}
            </span>
          )}
        </div>
      )}

      {/* Advanced expandable filter options */}
      {showAdvanced && (
        <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 sm:grid-cols-3">
          {/* Branch filter if available */}
          {branchOptions && branchOptions.length > 0 && (
            <div>
              <label className="text-[11px] font-medium text-slate-500 mb-1 block">Showroom Branch</label>
              <Select
                value={values.branchId || "ALL"}
                onValueChange={(branchId) => onChange({ ...values, branchId })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">
                    All Showrooms
                  </SelectItem>
                  {branchOptions.map((b) => (
                    <SelectItem key={b.value} value={b.value} className="text-xs">
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Min Price */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">Min Price ($)</label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 5000"
              value={values.priceMin || ""}
              onChange={(e) => onChange({ ...values, priceMin: e.target.value })}
              className="h-8 text-xs"
            />
          </div>

          {/* Max Price */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 mb-1 block">Max Price ($)</label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 50000"
              value={values.priceMax || ""}
              onChange={(e) => onChange({ ...values, priceMax: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
