"use client";

// Shared pagination bar — windowed numbered pages with prev/next,
// optional page size selector and item range indicator.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Build the windowed page list: 1 … (p-1) p (p+1) … pageCount. */
function buildPageList(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const out: (number | "ellipsis")[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pageCount - 1, page + 1);
  if (lo > 2) out.push("ellipsis");
  for (let p = lo; p <= hi; p += 1) out.push(p);
  if (hi < pageCount - 1) out.push("ellipsis");
  out.push(pageCount);
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  pageSizeOptions = [8, 16, 32, 50],
  disabled,
  className,
}: {
  /** 1-based current page. */
  page: number;
  /** Total pages (≥ 1). */
  pageCount: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  totalItems?: number;
  pageSizeOptions?: number[];
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();

  const clamped = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const pages = buildPageList(clamped, pageCount);

  const startIdx = totalItems !== undefined && pageSize !== undefined
    ? Math.min(totalItems, (clamped - 1) * pageSize + 1)
    : undefined;
  const endIdx = totalItems !== undefined && pageSize !== undefined
    ? Math.min(totalItems, clamped * pageSize)
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500",
        className,
      )}
    >
      {/* Range indicator & page size */}
      <div className="flex items-center gap-2">
        {totalItems !== undefined && startIdx !== undefined && endIdx !== undefined && (
          <span className="font-mono text-[11px] text-slate-500">
            Showing <strong className="text-slate-800">{startIdx}–{endIdx}</strong> of{" "}
            <strong className="text-slate-800">{totalItems}</strong>
          </span>
        )}

        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1 text-[11px]">
            <span>·</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={disabled}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
            >
              {pageSizeOptions.map((sz) => (
                <option key={sz} value={sz}>
                  {sz} / page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Numbered buttons with prev / next */}
      {pageCount > 1 ? (
        <nav
          role="navigation"
          aria-label={t("paginationPageOf", { page: clamped, count: pageCount })}
          className="flex flex-wrap items-center gap-1.5"
        >
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={disabled || clamped <= 1}
            onClick={() => onPageChange(clamped - 1)}
            aria-label={t("paginationPrev")}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>

          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`e-${i}`}
                aria-hidden
                className="hidden select-none px-0.5 text-sm text-slate-400 sm:inline"
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === clamped ? "default" : "outline"}
                size="icon"
                onClick={() => onPageChange(p)}
                disabled={disabled}
                aria-current={p === clamped ? "page" : undefined}
                aria-label={t("paginationPageOf", { page: p, count: pageCount })}
                className={cn(
                  "h-8 w-8 text-xs",
                  p === clamped
                    ? "bg-amber-500 font-bold text-slate-950 hover:bg-amber-400"
                    : "hidden sm:inline-flex",
                )}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={disabled || clamped >= pageCount}
            onClick={() => onPageChange(clamped + 1)}
            aria-label={t("paginationNext")}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
