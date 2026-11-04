/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  calculateTimeRemaining,
  PromoCountdownTimer,
  PromotionalPricingBanner,
} from "@/components/marketplace/promotional-pricing-banner";

describe("Isolated Segmented Promotional Countdown Timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. calculateTimeRemaining function", () => {
    it("returns null for null, undefined, or empty date strings", () => {
      expect(calculateTimeRemaining(null)).toBeNull();
      expect(calculateTimeRemaining(undefined)).toBeNull();
      expect(calculateTimeRemaining("")).toBeNull();
      expect(calculateTimeRemaining("invalid-date")).toBeNull();
    });

    it("correctly breaks down future date into days, hours, minutes, and seconds", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      // 2 days, 3 hours, 4 minutes, 5 seconds into future
      const target = new Date(
        now + (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000
      ).toISOString();

      const rem = calculateTimeRemaining(target);
      expect(rem).not.toBeNull();
      expect(rem?.isExpired).toBe(false);
      expect(rem?.days).toBe(2);
      expect(rem?.hours).toBe(3);
      expect(rem?.minutes).toBe(4);
      expect(rem?.seconds).toBe(5);
    });

    it("flags past dates as isExpired: true with zeros", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      const past = new Date(now - 10000).toISOString();
      const rem = calculateTimeRemaining(past);
      expect(rem).not.toBeNull();
      expect(rem?.isExpired).toBe(true);
      expect(rem?.days).toBe(0);
      expect(rem?.hours).toBe(0);
      expect(rem?.minutes).toBe(0);
      expect(rem?.seconds).toBe(0);
    });
  });

  describe("2. PromoCountdownTimer Component Isolation & Presentation", () => {
    it("renders segmented digit pills with zero layout shift and no animate-spin", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      // Target in 24 days, 19 hours, 0 minutes, 53 seconds
      const target = new Date(
        now + (24 * 86400 + 19 * 3600 + 0 * 60 + 53) * 1000
      ).toISOString();

      const { container } = render(<PromoCountdownTimer endDate={target} />);

      // Verify "Ends in:" label exists
      expect(screen.getByText(/Ends in:/i)).toBeInTheDocument();

      // Verify segmented pills exist
      expect(screen.getByText("24d")).toBeInTheDocument();
      expect(screen.getByText("19h")).toBeInTheDocument();
      expect(screen.getByText("00m")).toBeInTheDocument();
      expect(screen.getByText("53s")).toBeInTheDocument();

      // Verify NO animate-spin class exists (which gave the perpetual loading illusion)
      const spinningElements = container.querySelectorAll(".animate-spin");
      expect(spinningElements.length).toBe(0);

      // Verify NO animate-pulse class exists
      const pulsingElements = container.querySelectorAll(".animate-pulse");
      expect(pulsingElements.length).toBe(0);
    });

    it("updates seconds cleanly on timer interval tick", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      const target = new Date(now + 65 * 1000).toISOString(); // 1m 05s
      render(<PromoCountdownTimer endDate={target} />);

      expect(screen.getByText("01m")).toBeInTheDocument();
      expect(screen.getByText("05s")).toBeInTheDocument();

      // Advance by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText("01m")).toBeInTheDocument();
      expect(screen.getByText("04s")).toBeInTheDocument();
    });

    it("displays Promotion Ended and calls onExpire when time runs out", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      const onExpire = vi.fn();
      const target = new Date(now + 2000).toISOString(); // 2 seconds remaining

      render(<PromoCountdownTimer endDate={target} onExpire={onExpire} />);
      expect(screen.getByText("02s")).toBeInTheDocument();

      // Advance past expiration
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText(/Promotion Ended/i)).toBeInTheDocument();
      expect(onExpire).toHaveBeenCalled();
    });
  });

  describe("3. PromotionalPricingBanner Clean Styling", () => {
    it("renders stable banner without animate-spin or animate-pulse and with transition-colors", () => {
      const now = new Date("2026-11-04T12:00:00Z").getTime();
      vi.setSystemTime(now);

      const target = new Date(now + 3600 * 1000).toISOString();

      const { container } = render(
        <PromotionalPricingBanner
          basePriceUsd={69000}
          effectivePriceUsd={62100}
          isOnSale={true}
          activePriceType={{
            code: "FLASH_SALE",
            label: "Flash Sale",
            badgeColor: "#F97316",
            mode: "PERCENT",
          }}
          activeItemPrice={{
            value: 10,
            endDate: target,
          }}
          discountUsd={6900}
          discountPercent={10}
        />
      );

      // Verify sale prices
      expect(screen.getByText("$62,100")).toBeInTheDocument();
      expect(screen.getByText("$69,000")).toBeInTheDocument();
      expect(screen.getByText("Flash Sale")).toBeInTheDocument();

      // Verify no animate-spin or animate-pulse on any icon
      expect(container.querySelectorAll(".animate-spin").length).toBe(0);
      expect(container.querySelectorAll(".animate-pulse").length).toBe(0);

      // Verify no transition-all duration-300
      expect(container.querySelectorAll(".transition-all").length).toBe(0);
      expect(container.querySelectorAll(".transition-colors").length).toBeGreaterThan(0);
    });
  });
});
