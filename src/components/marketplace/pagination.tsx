"use client";

// Shared pagination bar — windowed numbered pages with prev/next.
// Numbered buttons hide on small screens (current page excepted) so the bar
// stays compact on mobile; prev/next + the aria-label always carry the state.

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
  disabled,
  className,
}: {
  /** 1-based current page. */
  page: number;
  /** Total pages (≥ 1). Renders nothing when pageCount <= 1. */
  pageCount: number;
  onPageChange: (p: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT();
  if (pageCount <= 1) return null;

  const clamped = Math.min(Math.max(1, page), pageCount);
  const pages = buildPageList(clamped, pageCount);

  return (
    <nav
      role="navigation"
      aria-label={t("paginationPageOf", { page: clamped, count: pageCount })}
      className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}
    >
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={disabled || clamped <= 1}
        onClick={() => onPageChange(clamped - 1)}
        aria-label={t("paginationPrev")}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
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
              "h-9 w-9 text-sm",
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
        className="h-9 w-9"
        disabled={disabled || clamped >= pageCount}
        onClick={() => onPageChange(clamped + 1)}
        aria-label={t("paginationNext")}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
    </nav>
  );
}
