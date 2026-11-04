import { describe, it, expect } from "vitest";
import { parsePricingCsv } from "@/app/api/pricing/csv-import/route";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

describe("Admin Pricing Engine, Bulk Pricing & CSV Import", () => {
  describe("1. CSV Pricing Parser & Normalization", () => {
    it("parses valid CSV rows with vehicle_id, price_type, and value", () => {
      const csv = `vehicle_id,price_type,value,start_date,end_date
veh-101,HOT_PRICE,18500,2026-11-01,2026-11-30
veh-102,DISCOUNT_PRICE,15,,
`;

      const rows = parsePricingCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        identifier: "veh-101",
        priceTypeCode: "HOT_PRICE",
        value: 18500,
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      });
      expect(rows[1]).toEqual({
        identifier: "veh-102",
        priceTypeCode: "DISCOUNT_PRICE",
        value: 15,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it("supports stock_no and case-insensitive headers", () => {
      const csv = `Stock_No,PriceType,Amount,Start,End
STK-ALPHA,FLASH_SALE,20,2026-11-04,2026-11-10
STK-BETA,CLEARANCE,15000,,
`;

      const rows = parsePricingCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0].identifier).toBe("STK-ALPHA");
      expect(rows[0].priceTypeCode).toBe("FLASH_SALE");
      expect(rows[0].value).toBe(20);
    });

    it("throws error when mandatory columns are missing", () => {
      const invalidCsv = `make,model,year\nToyota,Camry,2020\n`;
      expect(() => parsePricingCsv(invalidCsv)).toThrowError(
        /CSV must include columns for vehicle identifier/,
      );
    });
  });

  describe("2. Bulk Pricing Calculation & Floor Enforcement", () => {
    it("correctly calculates bulk discount across multiple listings with floor protection", () => {
      // 3 test vehicles with varying floor prices
      const vehicles = [
        { id: "v1", priceUsd: 30000, floorPriceUsd: 25000 }, // 20% off -> 24000 (below floor 25000) -> clamped to 25000
        { id: "v2", priceUsd: 20000, floorPriceUsd: 14000 }, // 20% off -> 16000 (above floor 14000) -> 16000
        { id: "v3", priceUsd: 10000, floorPriceUsd: null },  // 20% off -> 8000 -> 8000
      ];

      const discountPriceType = {
        code: "PROMOTE_PRICE",
        label: "Promote Price",
        mode: "PERCENT" as const,
        badgeColor: "#F59E0B",
        priority: 80,
        active: true,
      };

      const results = vehicles.map((v) =>
        resolveEffectivePrice({
          id: v.id,
          priceUsd: v.priceUsd,
          floorPriceUsd: v.floorPriceUsd,
          itemPrices: [
            {
              value: 20, // 20% discount
              priceType: discountPriceType,
              active: true,
            },
          ],
        }),
      );

      // v1 clamped to floor 25000
      expect(results[0].effectivePriceUsd).toBe(25000);
      expect(results[0].floorEnforced).toBe(true);

      // v2 unclamped at 16000
      expect(results[1].effectivePriceUsd).toBe(16000);
      expect(results[1].floorEnforced).toBe(false);

      // v3 unclamped at 8000
      expect(results[2].effectivePriceUsd).toBe(8000);
      expect(results[2].floorEnforced).toBe(false);
    });
  });
});

