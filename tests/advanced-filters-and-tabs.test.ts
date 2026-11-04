import { describe, it, expect } from "vitest";
import { buildVehicleWhere } from "@/lib/api/vehicle-filters";

describe("Advanced Search Filters & Multi-Category Tab Isolation", () => {
  describe("1. Category Tabs & Common Shared Fields", () => {
    it("isolates Car category while applying shared search, price, and location filters", () => {
      const sp = new URLSearchParams({
        category: "CAR",
        q: "Lexus",
        priceMin: "20000",
        priceMax: "80000",
        city: "Phnom Penh",
        condition: "LIKE_NEW",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).listingCategory).toBe("CAR");
      expect(where.city).toBe("Phnom Penh");
      expect(where.condition).toEqual({ in: ["LIKE_NEW"] });
      expect(where.priceUsd).toEqual({ gte: 20000, lte: 80000 });
    });

    it("isolates Motor category while preserving common price and sort parameters", () => {
      const sp = new URLSearchParams({
        category: "MOTOR",
        make: "Honda",
        model: "Dream 125",
        priceMax: "3000",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).listingCategory).toBe("MOTOR");
      expect(where.make).toBe("Honda");
      expect(where.model).toBe("Dream 125");
      expect(where.priceUsd).toEqual({ lte: 3000 });
    });

    it("isolates Spare Part category while preserving common keyword and port location", () => {
      const sp = new URLSearchParams({
        category: "SPARE_PART",
        locationPort: "Sihanoukville Port",
        partCategory: "BRAKES_SUSPENSION",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).listingCategory).toBe("SPARE_PART");
      expect((where as any).locationPort).toBe("Sihanoukville Port");
      expect((where as any).partCategory).toBe("BRAKES_SUSPENSION");
    });
  });

  describe("2. Car Specific Filters & Import Attributes", () => {
    it("filters by steering (Left-Hand vs Right-Hand Drive imports)", () => {
      const whereLHD = buildVehicleWhere(new URLSearchParams({ steering: "LEFT" }));
      expect((whereLHD as any).steering).toBe("LEFT");

      const whereRHD = buildVehicleWhere(new URLSearchParams({ steering: "RIGHT" }));
      expect((whereRHD as any).steering).toBe("RIGHT");
    });

    it("filters by seats, doors, and variant/trim", () => {
      const sp = new URLSearchParams({
        seats: "7",
        doors: "5",
        grade: "Platinum",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).seats).toBe(7);
      expect((where as any).doors).toBe(5);
      expect(where.variant).toEqual({ contains: "Platinum", mode: "insensitive" });
    });

    it("filters by chassis number and stock number", () => {
      const sp = new URLSearchParams({
        chassisNo: "URJ201-002341",
        stockNo: "STK-8899",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).chassisNo).toEqual({ contains: "URJ201-002341", mode: "insensitive" });
      expect((where as any).stockNo).toEqual({ contains: "STK-8899", mode: "insensitive" });
    });
  });

  describe("3. Motor Specific Filters", () => {
    it("filters motorcycle type, displacement cc, ABS, and start type", () => {
      const sp = new URLSearchParams({
        category: "MOTOR",
        motorType: "SCOOTER",
        engineCcMin: "125",
        engineCcMax: "160",
        hasAbs: "true",
        startType: "ELECTRIC",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).listingCategory).toBe("MOTOR");
      expect((where as any).motorType).toBe("SCOOTER");
      expect(where.engineCc).toEqual({ gte: 125, lte: 160 });
      expect((where as any).hasAbs).toBe(true);
      expect((where as any).startType).toBe("ELECTRIC");
    });
  });

  describe("4. Spare Part Specific Filters", () => {
    it("filters spare parts by OEM part number, brand, position, and compatibility", () => {
      const sp = new URLSearchParams({
        category: "SPARE_PART",
        partNumber: "09.A820.11",
        oemBrand: "Brembo",
        isOem: "true",
        position: "FRONT",
        compatibleMake: "Toyota",
        compatibleModel: "Prius",
      });

      const where = buildVehicleWhere(sp);
      expect((where as any).listingCategory).toBe("SPARE_PART");
      expect((where as any).partNumber).toEqual({ contains: "09.A820.11", mode: "insensitive" });
      expect((where as any).oemBrand).toBe("Brembo");
      expect((where as any).isOem).toBe(true);
      expect((where as any).position).toBe("FRONT");
      expect((where as any).compatibleMake).toBe("Toyota");
      expect((where as any).compatibleModel).toBe("Prius");
    });
  });

  describe("5. Promotional Pricing & Price Type Filtering", () => {
    it("filters by specific promotional price type tier", () => {
      const sp = new URLSearchParams({
        priceType: "HOT_PRICE",
      });

      const where = buildVehicleWhere(sp);
      expect(where.itemPrices).toBeDefined();
      expect((where.itemPrices as any).some?.priceType?.code).toBe("HOT_PRICE");
    });
  });
});

