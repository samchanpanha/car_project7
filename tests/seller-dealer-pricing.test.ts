import { describe, it, expect } from "vitest";
import {
  resolveEffectivePrice,
  isItemPriceActive,
  calculateCandidatePrice,
  type PriceTypeConfig,
  type ItemPriceRecord,
} from "@/lib/pricing/price-engine";
import { parsePricingCsv } from "@/app/api/pricing/csv-import/route";
import { canWriteTenant } from "@/lib/api/guards";

describe("Seller & Dealer Flexible Pricing Engine & Promotions", () => {
  const hotPriceType: PriceTypeConfig = {
    code: "HOT_PRICE",
    label: "Hot Price",
    mode: "FIXED",
    badgeColor: "#EF4444",
    priority: 100,
    active: true,
  };

  const promotePriceType: PriceTypeConfig = {
    code: "PROMOTE_PRICE",
    label: "Promote Price",
    mode: "PERCENT",
    badgeColor: "#F59E0B",
    priority: 80,
    active: true,
  };

  const discountPriceType: PriceTypeConfig = {
    code: "DISCOUNT_PRICE",
    label: "Discount Price",
    mode: "PERCENT",
    badgeColor: "#10B981",
    priority: 50,
    active: true,
  };

  const clearanceType: PriceTypeConfig = {
    code: "CLEARANCE",
    label: "Clearance",
    mode: "FIXED",
    badgeColor: "#8B5CF6",
    priority: 70,
    active: true,
  };

  describe("1. Pricing Engine Resolution & Invariants", () => {
    it("returns base price when vehicle has no promotions", () => {
      const result = resolveEffectivePrice({
        id: "veh-1",
        priceUsd: 25000,
        floorPriceUsd: 20000,
        itemPrices: [],
      });

      expect(result.effectivePriceUsd).toBe(25000);
      expect(result.basePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(false);
      expect(result.discountUsd).toBe(0);
      expect(result.floorEnforced).toBe(false);
      expect(result.activePriceType).toBeNull();
    });

    it("resolves fixed target price promotion (HOT_PRICE)", () => {
      const itemPrices: ItemPriceRecord[] = [
        {
          value: 21500, // target discounted price
          priceType: hotPriceType,
          active: true,
        },
      ];

      const result = resolveEffectivePrice({
        id: "veh-2",
        priceUsd: 25000,
        floorPriceUsd: 19000,
        itemPrices,
      });

      expect(result.effectivePriceUsd).toBe(21500);
      expect(result.basePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(true);
      expect(result.discountUsd).toBe(3500);
      expect(result.discountPercent).toBe(14);
      expect(result.floorEnforced).toBe(false);
      expect(result.activePriceType?.code).toBe("HOT_PRICE");
    });

    it("resolves percentage discount promotion (DISCOUNT_PRICE)", () => {
      const itemPrices: ItemPriceRecord[] = [
        {
          value: 15, // 15% discount
          priceType: discountPriceType,
          active: true,
        },
      ];

      const result = resolveEffectivePrice({
        id: "veh-3",
        priceUsd: 40000,
        floorPriceUsd: 30000,
        itemPrices,
      });

      // 40000 * (1 - 0.15) = 34000
      expect(result.effectivePriceUsd).toBe(34000);
      expect(result.basePriceUsd).toBe(40000);
      expect(result.isOnSale).toBe(true);
      expect(result.discountUsd).toBe(6000);
      expect(result.discountPercent).toBe(15);
      expect(result.floorEnforced).toBe(false);
    });

    it("enforces floor price protection when promotion would sell below floor", () => {
      // Base: $30,000, Floor: $26,000
      // 20% discount would give $24,000, but floor is $26,000
      const itemPrices: ItemPriceRecord[] = [
        {
          value: 20, // 20% discount
          priceType: promotePriceType,
          active: true,
        },
      ];

      const result = resolveEffectivePrice({
        id: "veh-4",
        priceUsd: 30000,
        floorPriceUsd: 26000,
        itemPrices,
      });

      expect(result.effectivePriceUsd).toBe(26000);
      expect(result.floorEnforced).toBe(true);
      expect(result.isOnSale).toBe(true);
      expect(result.discountUsd).toBe(4000); // 30,000 - 26,000
      expect(result.floorPriceUsd).toBe(26000);
    });

    it("resolves highest-priority promotion when multiple active tiers exist", () => {
      const itemPrices: ItemPriceRecord[] = [
        {
          value: 10, // 10% off -> $27,000 (priority 50)
          priceType: discountPriceType,
          active: true,
        },
        {
          value: 24000, // Fixed $24,000 (priority 100)
          priceType: hotPriceType,
          active: true,
        },
        {
          value: 22000, // Fixed $22,000 (priority 70)
          priceType: clearanceType,
          active: true,
        },
      ];

      const result = resolveEffectivePrice({
        id: "veh-5",
        priceUsd: 30000,
        floorPriceUsd: 20000,
        itemPrices,
      });

      // HOT_PRICE has priority 100 > CLEARANCE (70) > DISCOUNT_PRICE (50)
      expect(result.activePriceType?.code).toBe("HOT_PRICE");
      expect(result.effectivePriceUsd).toBe(24000);
    });
  });

  describe("2. Date Scheduling & Expiry Rules", () => {
    it("respects start date: promo is inactive before start date", () => {
      const now = new Date("2026-11-04T12:00:00Z");
      const futureStart = new Date("2026-11-10T00:00:00Z");

      const promo: ItemPriceRecord = {
        value: 15,
        priceType: discountPriceType,
        startDate: futureStart,
        active: true,
      };

      expect(isItemPriceActive(promo, now)).toBe(false);

      const result = resolveEffectivePrice(
        {
          id: "veh-sched-1",
          priceUsd: 20000,
          itemPrices: [promo],
        },
        now
      );

      expect(result.isOnSale).toBe(false);
      expect(result.effectivePriceUsd).toBe(20000);
    });

    it("respects end date: promo is inactive after expiration", () => {
      const now = new Date("2026-11-04T12:00:00Z");
      const pastEnd = new Date("2026-11-01T00:00:00Z");

      const promo: ItemPriceRecord = {
        value: 20,
        priceType: promotePriceType,
        endDate: pastEnd,
        active: true,
      };

      expect(isItemPriceActive(promo, now)).toBe(false);

      const result = resolveEffectivePrice(
        {
          id: "veh-sched-2",
          priceUsd: 20000,
          itemPrices: [promo],
        },
        now
      );

      expect(result.isOnSale).toBe(false);
      expect(result.effectivePriceUsd).toBe(20000);
    });

    it("applies promo when current time falls within valid schedule range", () => {
      const now = new Date("2026-11-04T12:00:00Z");
      const start = new Date("2026-11-01T00:00:00Z");
      const end = new Date("2026-11-15T00:00:00Z");

      const promo: ItemPriceRecord = {
        value: 10,
        priceType: discountPriceType,
        startDate: start,
        endDate: end,
        active: true,
      };

      expect(isItemPriceActive(promo, now)).toBe(true);

      const result = resolveEffectivePrice(
        {
          id: "veh-sched-3",
          priceUsd: 20000,
          itemPrices: [promo],
        },
        now
      );

      expect(result.isOnSale).toBe(true);
      expect(result.effectivePriceUsd).toBe(18000);
    });
  });

  describe("3. Dealership & Seller Authorization Rules", () => {
    it("allows tenant owners and managers to write pricing", () => {
      expect(canWriteTenant("OWNER")).toBe(true);
      expect(canWriteTenant("MANAGER")).toBe(true);
      expect(canWriteTenant("INVENTORY_MANAGER")).toBe(true);
    });

    it("blocks sales staff and viewers from modifying dealership pricing", () => {
      expect(canWriteTenant("SALES_STAFF")).toBe(false);
      expect(canWriteTenant("VIEWER")).toBe(false);
    });
  });

  describe("4. Bulk Promotion Pre-Flight & Execution Simulation", () => {
    it("simulates bulk discount with floor clamping summary", () => {
      const testInventory = [
        { id: "car-1", base: 50000, floor: 45000 }, // 10% off -> 45000 (equal to floor)
        { id: "car-2", base: 40000, floor: 38000 }, // 10% off -> 36000 (below floor 38000) -> clamped
        { id: "car-3", base: 30000, floor: 25000 }, // 10% off -> 27000 (above floor)
        { id: "car-4", base: 20000, floor: null },  // 10% off -> 18000 (no floor)
      ];

      const discountRate = 10;
      let clampedCount = 0;
      const resolvedList: number[] = [];

      for (const item of testInventory) {
        const candidate = Math.round(item.base * (1 - discountRate / 100));
        let effective = candidate;
        if (item.floor != null && candidate < item.floor) {
          clampedCount++;
          effective = item.floor;
        }
        resolvedList.push(effective);
      }

      expect(clampedCount).toBe(1); // car-2 clamped
      expect(resolvedList).toEqual([45000, 38000, 27000, 18000]);
    });
  });

  describe("5. CSV Pricing Import Parser Validation", () => {
    it("parses valid dealer CSV rows with stock_no and date windows", () => {
      const csv = `stock_no,price_type,value,start_date,end_date
STK-001,HOT_PRICE,16500,2026-11-01T00:00:00Z,2026-11-30T23:59:59Z
STK-002,PROMOTE_PRICE,12,,
`;

      const rows = parsePricingCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0].identifier).toBe("STK-001");
      expect(rows[0].priceTypeCode).toBe("HOT_PRICE");
      expect(rows[0].value).toBe(16500);
      expect(rows[0].startDate).toBe("2026-11-01T00:00:00Z");
      expect(rows[0].endDate).toBe("2026-11-30T23:59:59Z");

      expect(rows[1].identifier).toBe("STK-002");
      expect(rows[1].priceTypeCode).toBe("PROMOTE_PRICE");
      expect(rows[1].value).toBe(12);
    });

    it("throws a descriptive error when required identifier column is missing", () => {
      const badCsv = `model,price_type,value\nCamry,HOT_PRICE,18000\n`;
      expect(() => parsePricingCsv(badCsv)).toThrowError(
        /CSV must include columns for vehicle identifier/,
      );
    });
  });
});

