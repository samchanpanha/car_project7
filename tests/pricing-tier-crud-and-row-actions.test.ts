import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { GET as getAvailableTypes } from "@/app/api/seller/pricing/available-types/route";
import { POST as createPriceType } from "@/app/api/pricing/types/route";
import { PATCH as updatePriceType, DELETE as deletePriceType } from "@/app/api/pricing/types/[id]/route";
import { PATCH as patchVehicle, DELETE as deleteVehicle } from "@/app/api/vehicles/[id]/route";
import { POST as saveItemPrice } from "@/app/api/seller/pricing/item/route";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";
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

describe("Promotional Tier CRUD & Inventory Row Actions", () => {
  beforeEach(async () => {
    currentMockUser = await db.user.findUnique({
      where: { id: "usr_dealer_sokha" },
      include: { sellerProfile: true },
    });
  });

  describe("1. Available Types Data Parity", () => {
    it("returns both priceTypes and types keys with active tiers", async () => {
      const res = await getAvailableTypes();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.priceTypes).toBeDefined();
      expect(json.types).toBeDefined();
      expect(Array.isArray(json.priceTypes)).toBe(true);
      expect(Array.isArray(json.types)).toBe(true);
      expect(json.priceTypes.length).toBeGreaterThan(0);
      expect(json.priceTypes.length).toBe(json.types.length);
      expect(json.priceTypes[0].id).toBe(json.types[0].id);
    });
  });

  describe("2. Promotional Tier CRUD (POST, PATCH, DELETE /api/pricing/types)", () => {
    const testCode = `TEST_TIER_${Date.now()}`;
    let createdTierId: string;

    it("creates a new promotional tier", async () => {
      const req = new NextRequest("http://localhost:3000/api/pricing/types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: testCode,
          label: "Weekend Flash Sale",
          mode: "PERCENT",
          badgeColor: "#F97316",
          priority: 75,
          active: true,
        }),
      });

      const res = await createPriceType(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.priceType).toBeDefined();
      expect(json.priceType.code).toBe(testCode);
      expect(json.priceType.label).toBe("Weekend Flash Sale");
      expect(json.priceType.mode).toBe("PERCENT");
      expect(json.priceType.badgeColor).toBe("#F97316");
      expect(json.priceType.priority).toBe(75);
      createdTierId = json.priceType.id;
    });

    it("updates existing promotional tier", async () => {
      expect(createdTierId).toBeDefined();
      const req = new NextRequest(`http://localhost:3000/api/pricing/types/${createdTierId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Mega Weekend Flash Sale",
          badgeColor: "#EF4444",
          priority: 85,
        }),
      });

      const res = await updatePriceType(req, { params: Promise.resolve({ id: createdTierId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.priceType.label).toBe("Mega Weekend Flash Sale");
      expect(json.priceType.badgeColor).toBe("#EF4444");
      expect(json.priceType.priority).toBe(85);
    });

    it("deletes the promotional tier safely", async () => {
      expect(createdTierId).toBeDefined();
      const req = new NextRequest(`http://localhost:3000/api/pricing/types/${createdTierId}`, {
        method: "DELETE",
      });

      const res = await deletePriceType(req, { params: Promise.resolve({ id: createdTierId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success || json.message).toBeDefined();

      const check = await db.priceType.findUnique({ where: { id: createdTierId } });
      expect(check === null || check.active === false).toBe(true);
    });
  });

  describe("3. Inventory Row Actions (PATCH, DELETE /api/vehicles/[id])", () => {
    it("updates vehicle listing status (e.g. to DRAFT and back to PUBLISHED)", async () => {
      currentMockUser = await db.user.findUnique({ where: { id: "usr_admin" } });
      const vehicle = await db.vehicle.findFirst({ where: { status: "PUBLISHED" } });
      expect(vehicle).toBeDefined();
      if (!vehicle) return;

      const reqDraft = new NextRequest(`http://localhost:3000/api/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      const resDraft = await patchVehicle(reqDraft, { params: Promise.resolve({ id: vehicle.id }) });
      expect(resDraft.status).toBe(200);
      const jsonDraft = await resDraft.json();
      expect(jsonDraft.ok).toBe(true);
      expect(jsonDraft.vehicle.status).toBe("DRAFT");

      // Restore back to PUBLISHED
      const reqPub = new NextRequest(`http://localhost:3000/api/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "PUBLISHED" }),
      });
      const resPub = await patchVehicle(reqPub, { params: Promise.resolve({ id: vehicle.id }) });
      expect(resPub.status).toBe(200);
      const jsonPub = await resPub.json();
      expect(jsonPub.ok).toBe(true);
      expect(jsonPub.vehicle.status).toBe("PUBLISHED");
    });

    it("archives a vehicle on delete", async () => {
      currentMockUser = await db.user.findUnique({ where: { id: "usr_admin" } });
      const targetVehicle = await db.vehicle.findFirst();
      expect(targetVehicle).toBeDefined();
      if (!targetVehicle) return;

      const originalStatus = targetVehicle.status;

      const req = new NextRequest(`http://localhost:3000/api/vehicles/${targetVehicle.id}`, {
        method: "DELETE",
      });
      const res = await deleteVehicle(req, { params: Promise.resolve({ id: targetVehicle.id }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.vehicle.status).toBe("ARCHIVED");

      // Restore original status
      await db.vehicle.update({
        where: { id: targetVehicle.id },
        data: { status: originalStatus },
      });
    });
  });

  describe("4. Single Vehicle Pricing & Floor Protection Safeguard Resolution", () => {
    it("accurately clamps candidate price to floor and enforces safeguard", async () => {
      const alphard = await db.vehicle.findFirst({
        where: { stockNo: "STK-SK-001" },
        include: {
          itemPrices: { include: { priceType: true } },
        },
      });
      expect(alphard).toBeDefined();
      if (!alphard) return;

      expect(alphard.priceUsd).toBe(118000);
      expect(alphard.floorPriceUsd).toBe(105000);

      const pricing = resolveEffectivePrice({
        id: alphard.id,
        priceUsd: alphard.priceUsd,
        floorPriceUsd: alphard.floorPriceUsd,
        itemPrices: alphard.itemPrices,
      });

      // 20% discount on $118,000 gives $94,400. Since floor is $105,000, effective must be clamped to $105,000!
      expect(pricing.effectivePriceUsd).toBe(105000);
      expect(pricing.floorEnforced).toBe(true);
      expect(pricing.isOnSale).toBe(true);
      expect(pricing.discountUsd).toBe(13000);
      expect(pricing.activePriceType?.code).toBe("PROMOTE_PRICE");
      expect(pricing.activePriceType?.mode).toBe("PERCENT");
    });

    it("saves promotional item price and deactivates prior rules", async () => {
      const alphard = await db.vehicle.findFirst({ where: { stockNo: "STK-SK-001" } });
      expect(alphard).toBeDefined();
      if (!alphard) return;

      const req = new NextRequest("http://localhost:3000/api/seller/pricing/item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vehicleId: alphard.id,
          priceTypeId: "pt_promote_price",
          value: 20,
          floorPriceUsd: 105000,
        }),
      });

      const res = await saveItemPrice(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.effectivePricing.effectivePriceUsd).toBe(105000);
      expect(json.effectivePricing.floorEnforced).toBe(true);

      // Verify only 1 active itemPrice remains
      const activeCount = await db.itemPrice.count({
        where: { vehicleId: alphard.id, active: true },
      });
      expect(activeCount).toBe(1);
    });
  });
});
