import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { GET as lookupInventory } from "@/app/api/seller/inventory/lookup/route";
import { POST as quickAddInventory } from "@/app/api/seller/inventory/quick-add/route";
import { POST as csvImport } from "@/app/api/seller/pricing/csv/route";
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

describe("Inventory Stock Quantity Auto-Increment & Duplicate Resolution", () => {
  beforeEach(async () => {
    currentMockUser = await db.user.findUnique({
      where: { id: "usr_dealer_sokha" },
      include: { sellerProfile: true },
    });
  });

  describe("1. Live Duplicate Detection Lookup (/api/seller/inventory/lookup)", () => {
    it("detects existing inventory by stockNo", async () => {
      const alphard = await db.vehicle.findFirst({
        where: { stockNo: "STK-SK-001" },
      });
      expect(alphard).toBeDefined();

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/lookup?stockNo=STK-SK-001&category=CAR");
      const res = await lookupInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.found).toBe(true);
      expect(json.matchType).toBe("STOCK_NO");
      expect(json.vehicle.id).toBe(alphard!.id);
      expect(json.vehicle.make).toBe("Toyota");
      expect(json.vehicle.model).toBe("Alphard");
      expect(json.vehicle.stockQuantity).toBeGreaterThanOrEqual(1);
    });

    it("detects existing inventory by chassisNo", async () => {
      const alphard = await db.vehicle.findFirst({
        where: { chassisNo: "AGH30-019823" },
      });
      expect(alphard).toBeDefined();

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/lookup?chassisNo=AGH30-019823&category=CAR");
      const res = await lookupInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.found).toBe(true);
      expect(json.matchType).toBe("CHASSIS_NO");
      expect(json.vehicle.id).toBe(alphard!.id);
    });

    it("detects existing inventory by partNumber for spare parts", async () => {
      const part = await db.vehicle.findFirst({
        where: { partNumber: "ALP-MAT-5D" },
      });
      expect(part).toBeDefined();

      const req = new NextRequest("http://localhost:3000/api/seller/inventory/lookup?partNumber=ALP-MAT-5D&category=SPARE_PART");
      const res = await lookupInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.found).toBe(true);
      expect(json.matchType).toBe("PART_NUMBER");
      expect(json.vehicle.id).toBe(part!.id);
    });

    it("returns found: false for non-matching stock", async () => {
      const req = new NextRequest("http://localhost:3000/api/seller/inventory/lookup?stockNo=STK-NON-EXISTENT-9999");
      const res = await lookupInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.found).toBe(false);
    });
  });

  describe("2. Quick Add with Auto-Increment (/api/seller/inventory/quick-add)", () => {
    const testStockNo = `STK-TEST-${Date.now()}`;

    it("creates a brand new listing with initial stock quantity", async () => {
      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingCategory: "CAR",
          make: "Mazda",
          model: "CX-5",
          variant: "Signature AWD",
          year: 2023,
          quantity: 2,
          priceUsd: 38000,
          floorPriceUsd: 35000,
          stockNo: testStockNo,
        }),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.action).toBe("CREATED");
      expect(json.newStock).toBe(2);
      expect(json.vehicle.stockNo).toBe(testStockNo);

      const dbRecord = await db.vehicle.findUnique({ where: { id: json.vehicle.id } });
      expect((dbRecord as any).stockQuantity).toBe(2);
    });

    it("auto-increments stock quantity when re-entering duplicate stockNo", async () => {
      const req = new NextRequest("http://localhost:3000/api/seller/inventory/quick-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingCategory: "CAR",
          make: "Mazda",
          model: "CX-5",
          variant: "Signature AWD",
          year: 2023,
          quantity: 3, // adding 3 more units
          priceUsd: 37500, // updated base price
          floorPriceUsd: 34500,
          stockNo: testStockNo, // matches existing
        }),
      });

      const res = await quickAddInventory(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.action).toBe("INCREMENTED");
      expect(json.previousStock).toBe(2);
      expect(json.newStock).toBe(5); // 2 + 3 = 5!
      expect(json.incrementedBy).toBe(3);
      expect(json.vehicle.priceUsd).toBe(37500);

      const dbRecord = await db.vehicle.findUnique({ where: { id: json.vehicle.id } });
      expect((dbRecord as any).stockQuantity).toBe(5);

      // Clean up test listing
      await db.vehicle.delete({ where: { id: json.vehicle.id } });
    });
  });

  describe("3. CSV Batch Import Duplicate Detection & Stock Increment (/api/seller/pricing/csv)", () => {
    it("increments stock for duplicate listings and creates new ones in CSV batch", async () => {
      const uniqueStock1 = `STK-CSV-${Date.now()}-A`;
      const uniqueStock2 = `STK-CSV-${Date.now()}-B`;

      // Step A: Create initial listing with stock 2
      const initial = await db.vehicle.create({
        data: {
          sellerId: currentMockUser.id,
          createdById: currentMockUser.id,
          listingCategory: "CAR",
          make: "Toyota",
          model: "Raize",
          year: 2023,
          priceUsd: 22000,
          stockNo: uniqueStock1,
          stockQuantity: 2,
          bodyType: "SUV",
          transmission: "AUTOMATIC",
          fuel: "PETROL",
          mileageKm: 0,
        },
      });

      // Step B: Import CSV with 2 rows: 1 duplicate (adding 4 units) and 1 brand new (3 units)
      const csvContent = [
        "category,make,model,year,base_price,floor_price,stock_no,quantity",
        `CAR,Toyota,Raize,2023,21800,20000,${uniqueStock1},4`,
        `MOTOR,Yamaha,QBIX,2024,2400,2100,${uniqueStock2},3`,
      ].join("\n");

      const req = new NextRequest("http://localhost:3000/api/seller/pricing/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "CREATE_LISTINGS",
          csv: csvContent,
        }),
      });

      const res = await csvImport(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.mode).toBe("CREATE_LISTINGS");
      expect(json.createdCount).toBe(1);
      expect(json.incrementedCount).toBe(1);
      expect(json.importedCount).toBe(2);
      expect(json.failedCount).toBe(0);

      // Verify incremented record: 2 initial + 4 from CSV = 6
      const updatedExisting = await db.vehicle.findUnique({ where: { id: initial.id } });
      expect((updatedExisting as any).stockQuantity).toBe(6);
      expect(updatedExisting!.priceUsd).toBe(21800);

      // Verify newly created record: stock 3
      const newlyCreated = await db.vehicle.findFirst({ where: { stockNo: uniqueStock2 } });
      expect(newlyCreated).toBeDefined();
      expect((newlyCreated as any).stockQuantity).toBe(3);

      // Clean up test records
      await db.vehicle.deleteMany({
        where: { id: { in: [initial.id, newlyCreated!.id] } },
      });
    });
  });
});

