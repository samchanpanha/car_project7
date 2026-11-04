import { describe, it, expect } from "vitest";
import {
  resolveEffectivePrice,
  isItemPriceActive,
  calculateCandidatePrice,
  type VehiclePricingContext,
  type ItemPriceRecord,
} from "@/lib/pricing/price-engine";

describe("Flexible Pricing Engine & Floor Price Enforcement", () => {
  const baseVehicle: VehiclePricingContext = {
    id: "veh-test-1",
    priceUsd: 25000,
    floorPriceUsd: 20000,
  };

  const hotPriceType = {
    code: "HOT_PRICE",
    label: "Hot Price",
    mode: "FIXED" as const,
    badgeColor: "#EF4444",
    priority: 100,
    active: true,
  };

  const discountPriceType = {
    code: "DISCOUNT_PRICE",
    label: "Discount Price",
    mode: "PERCENT" as const,
    badgeColor: "#10B981",
    priority: 60,
    active: true,
  };

  const promotePriceType = {
    code: "PROMOTE_PRICE",
    label: "Promote Price",
    mode: "PERCENT" as const,
    badgeColor: "#F59E0B",
    priority: 80,
    active: true,
  };

  describe("1. Base Price Fallback", () => {
    it("returns base price when vehicle has no promotional prices", () => {
      const result = resolveEffectivePrice(baseVehicle);
      expect(result.effectivePriceUsd).toBe(25000);
      expect(result.basePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(false);
      expect(result.discountUsd).toBe(0);
      expect(result.activePriceType).toBeNull();
      expect(result.floorEnforced).toBe(false);
    });

    it("returns base price when all promotional prices are inactive", () => {
      const vehicleWithInactive: VehiclePricingContext = {
        ...baseVehicle,
        itemPrices: [
          {
            value: 21000,
            active: false,
            priceType: hotPriceType,
          },
          {
            value: 15, // 15% off
            active: true,
            priceType: { ...discountPriceType, active: false }, // price type itself disabled
          },
        ],
      };

      const result = resolveEffectivePrice(vehicleWithInactive);
      expect(result.effectivePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(false);
    });
  });

  describe("2. Highest-Priority Active Price Resolution", () => {
    it("selects highest-priority active price when multiple prices exist", () => {
      // Hot Price (prio 100, fixed 22,000) vs Discount (prio 60, 10% off = 22,500)
      const vehicle: VehiclePricingContext = {
        ...baseVehicle,
        itemPrices: [
          {
            value: 10, // 10% off = 22,500
            priceType: discountPriceType, // priority 60
            active: true,
          },
          {
            value: 22000,
            priceType: hotPriceType, // priority 100
            active: true,
          },
        ],
      };

      const result = resolveEffectivePrice(vehicle);
      expect(result.activePriceType?.code).toBe("HOT_PRICE");
      expect(result.effectivePriceUsd).toBe(22000);
      expect(result.isOnSale).toBe(true);
      expect(result.discountUsd).toBe(3000);
      expect(result.discountPercent).toBe(12);
      expect(result.floorEnforced).toBe(false);
    });

    it("evaluates percentage discounts correctly", () => {
      const vehicle: VehiclePricingContext = {
        ...baseVehicle,
        itemPrices: [
          {
            value: 10, // 10% off of 25,000 = 22,500
            priceType: discountPriceType,
            active: true,
          },
        ],
      };

      const result = resolveEffectivePrice(vehicle);
      expect(result.effectivePriceUsd).toBe(22500);
      expect(result.discountUsd).toBe(2500);
      expect(result.discountPercent).toBe(10);
      expect(result.savingsBadgeText).toBe("-10%");
    });
  });

  describe("3. Date Scheduling & Expiry", () => {
    const now = new Date("2026-11-04T12:00:00Z");

    it("ignores item prices whose startDate is in the future", () => {
      const futurePrice: ItemPriceRecord = {
        value: 18000,
        priceType: hotPriceType,
        startDate: new Date("2026-11-10T00:00:00Z"),
        active: true,
      };

      expect(isItemPriceActive(futurePrice, now)).toBe(false);

      const result = resolveEffectivePrice({ ...baseVehicle, itemPrices: [futurePrice] }, now);
      expect(result.effectivePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(false);
    });

    it("ignores item prices whose endDate is in the past (expired)", () => {
      const expiredPrice: ItemPriceRecord = {
        value: 18000,
        priceType: hotPriceType,
        endDate: new Date("2026-11-01T00:00:00Z"),
        active: true,
      };

      expect(isItemPriceActive(expiredPrice, now)).toBe(false);

      const result = resolveEffectivePrice({ ...baseVehicle, itemPrices: [expiredPrice] }, now);
      expect(result.effectivePriceUsd).toBe(25000);
      expect(result.isOnSale).toBe(false);
    });

    it("activates item prices within valid date range", () => {
      const validPrice: ItemPriceRecord = {
        value: 21500,
        priceType: hotPriceType,
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-07T00:00:00Z"),
        active: true,
      };

      expect(isItemPriceActive(validPrice, now)).toBe(true);

      const result = resolveEffectivePrice({ ...baseVehicle, itemPrices: [validPrice] }, now);
      expect(result.effectivePriceUsd).toBe(21500);
      expect(result.isOnSale).toBe(true);
    });
  });

  describe("4. Floor Price Enforcement", () => {
    it("strictly clamps effective price to floor price when promo price is lower", () => {
      // Base: 25,000, Floor: 20,000
      // Promo offers 17,000 (fixed) or 40% off (15,000)
      const aggressivePromo: VehiclePricingContext = {
        ...baseVehicle, // floorPriceUsd = 20000
        itemPrices: [
          {
            value: 17000, // lower than floor 20,000!
            priceType: hotPriceType,
            active: true,
          },
        ],
      };

      const result = resolveEffectivePrice(aggressivePromo);
      // Must not drop below 20,000!
      expect(result.effectivePriceUsd).toBe(20000);
      expect(result.floorEnforced).toBe(true);
      expect(result.floorPriceUsd).toBe(20000);
      expect(result.discountUsd).toBe(5000);
      expect(result.isOnSale).toBe(true);
    });

    it("allows promotional price above floor price without clamping", () => {
      const safePromo: VehiclePricingContext = {
        ...baseVehicle, // floorPriceUsd = 20000
        itemPrices: [
          {
            value: 21000, // above floor 20,000
            priceType: hotPriceType,
            active: true,
          },
        ],
      };

      const result = resolveEffectivePrice(safePromo);
      expect(result.effectivePriceUsd).toBe(21000);
      expect(result.floorEnforced).toBe(false);
    });
  });
});

