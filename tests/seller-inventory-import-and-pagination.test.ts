import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { GET as getPricingInventory } from "@/app/api/seller/pricing/inventory/route";
import { POST as quickAddInventory } from "@/app/api/seller/inventory/quick-add/route";
import { POST as importPricingCsv } from "@/app/api/seller/pricing/csv/route";
import { NextRequest } from "next/server";

let currentMockUser: any = null;

vi.mock("@/lib/session", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getCurrentUser: vi.fn(async () => {
      if (currentMockUser) return currentMockUser;
      return actual.getCurrentUser();
    }),
  };
});

describe("Seller Inventory Manual Import & Server-Side Pagination", () => {
  const createdVehicleIds: string[] = [];

  beforeEach(async () => {
    currentMockUser = await db.user.findUnique({
      where: { id: "usr_dealer_sokha" },
      include: { sellerProfile: true },
    });
  });

  afterAll(async () => {
    if (createdVehicleIds.length > 0) {
      await db.itemPrice.deleteMany({
        where: { vehicleId: { in: createdVehicleIds } },
      });
      await db.vehicle.deleteMany({
        where: { id: { in: createdVehicleIds } },
      });
    }
  });

  describe("1. Server-Side Pagination in Pricing Inventory", () => {
    it("returns paginated inventory with default page=1 and pageSize=10", async () => {
      const req = new NextRequest("http://localhost:3000/api/seller/pricing/inventory?page=1&pageSize=10");
      const res = await getPricingInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(10);
      expect(json.totalCount).toBeGreaterThan(0);
      expect(json.totalPages).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(json.vehicles)).toBe(true);
      expect(json.vehicles.length).toBeLessThanOrEqual(10);
    });

    it("supports custom page sizes and page traversal", async () => {
      const req = new NextRequest("http://localhost:3000/api/seller/pricing/inventory?page=1&pageSize=5");
      const res = await getPricingInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.pageSize).toBe(5);
      expect(json.vehicles.length).toBeLessThanOrEqual(5);

      if (json.totalCount > 5) {
        expect(json.totalPages).toBeGreaterThanOrEqual(2);
        const reqPage2 = new NextRequest("http://localhost:3000/api/seller/pricing/inventory?page=2&pageSize=5");
        const resPage2 = await getPricingInventory(reqPage2);
        const jsonPage2 = await resPage2.json();
        expect(jsonPage2.page).toBe(2);
        expect(jsonPage2.vehicles.length).toBeGreaterThan(0);
        expect(jsonPage2.vehicles[0].id).not.toBe(json.vehicles[0].id);
      }
    });
  });

  describe("2. Quick Add Listing (POST /api/seller/inventory/quick-add)", () => {
    it("creates a new Car listing with floor price safeguard and launch promotional tier", async () => {
      const payload = {
        listingCategory: "CAR",
        make: "Porsche",
        model: "Macan GTS",
        year: 2023,
        priceUsd: 85000,
        floorPriceUsd: 78000,
        stockNo: `STK-TEST-CAR-${Date.now()}`,
        condition: "LIKE_NEW",
        bodyType: "SUV",
        transmission: "AUTOMATIC",
        fuel: "PETROL",
        mileageKm: 12000,
        promoPriceTypeId: "pt_hot_price",
        promoValue: 79900,
      };

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.vehicle).toBeDefined();
      expect(json.vehicle.make).toBe("Porsche");
      expect(json.vehicle.priceUsd).toBe(85000);
      expect(json.vehicle.floorPriceUsd).toBe(78000);
      createdVehicleIds.push(json.vehicle.id);

      // Verify active promotional tier in db
      const itemPrice = await db.itemPrice.findFirst({
        where: { vehicleId: json.vehicle.id },
      });
      expect(itemPrice).toBeDefined();
      expect(itemPrice?.priceTypeId).toBe("pt_hot_price");
      expect(itemPrice?.value).toBe(79900);
    });

    it("creates a new Motorcycle listing with motor-specific attributes", async () => {
      const payload = {
        listingCategory: "MOTOR",
        make: "Yamaha",
        model: "TMAX Tech MAX",
        year: 2024,
        priceUsd: 14500,
        floorPriceUsd: 13000,
        stockNo: `STK-TEST-MOT-${Date.now()}`,
        motorType: "SCOOTER",
        engineCc: 560,
        startType: "ELECTRIC",
        hasAbs: true,
      };

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.vehicle.listingCategory).toBe("MOTOR");
      expect(json.vehicle.hasAbs).toBe(true);
      expect(json.vehicle.engineCc).toBe(560);
      createdVehicleIds.push(json.vehicle.id);
    });

    it("creates a new Spare Part listing with partCategory and compatible models", async () => {
      const payload = {
        listingCategory: "SPARE_PART",
        make: "Öhlins",
        model: "Adjustable Rear Shock Absorber",
        priceUsd: 1200,
        floorPriceUsd: 1000,
        stockNo: `PART-TEST-${Date.now()}`,
        partCategory: "BRAKES_SUSPENSION",
        partNumber: "YA-535",
        position: "REAR",
        compatibleMake: "Yamaha",
        compatibleModel: "TMAX 560",
        compatibleYearMin: 2020,
        compatibleYearMax: 2024,
      };

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.vehicle.listingCategory).toBe("SPARE_PART");
      expect(json.vehicle.partCategory).toBe("BRAKES_SUSPENSION");
      expect(json.vehicle.partNumber).toBe("YA-535");
      createdVehicleIds.push(json.vehicle.id);
    });

    it("rejects listing creation if floor price exceeds base price", async () => {
      const payload = {
        listingCategory: "CAR",
        make: "Toyota",
        model: "Corolla",
        priceUsd: 20000,
        floorPriceUsd: 25000, // Invalid: floor > base
      };

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/cannot exceed base price/i);
    });
  });

  describe("3. Dual-Mode CSV Batch Import (POST /api/seller/pricing/csv)", () => {
    it("creates batch listings when mode is CREATE_LISTINGS or CSV contains vehicle columns", async () => {
      const uniqueStock1 = `STK-CSV-CAR-${Date.now()}`;
      const uniqueStock2 = `STK-CSV-MOT-${Date.now()}`;

      const csvContent =
        "category,make,model,year,base_price,floor_price,stock_no,promo_code,promo_value\n" +
        `CAR,Audi,Q7,2022,65000,58000,${uniqueStock1},DISCOUNT_PRICE,10\n` +
        `MOTOR,Kawasaki,Ninja 400,2023,5400,4800,${uniqueStock2},FLASH_SALE,5\n`;

      const req = new NextRequest("http://localhost:3000/api/seller/pricing/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvContent, mode: "CREATE_LISTINGS" }),
      });

      const res = await importPricingCsv(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.mode).toBe("CREATE_LISTINGS");
      expect(json.importedCount).toBe(2);

      const created = await db.vehicle.findMany({
        where: { stockNo: { in: [uniqueStock1, uniqueStock2] } },
      });
      expect(created.length).toBe(2);
      created.forEach((c) => createdVehicleIds.push(c.id));
    });
  });
});

