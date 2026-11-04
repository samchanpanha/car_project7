import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getVehicleDetail } from "@/app/api/vehicles/[id]/route";
import { GET as getInventory } from "@/app/api/seller/pricing/inventory/route";
import { POST as setItemPrice, DELETE as removeItemPrice, PATCH as updateFloorPrice } from "@/app/api/seller/pricing/item/route";
import { POST as applyBulkPromo, DELETE as removeBulkPromo } from "@/app/api/seller/pricing/bulk/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

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

describe("Promotions & Flexible Pricing Engine - Vehicle Detail & CRUD", () => {
  beforeEach(() => {
    currentMockUser = null;
  });

  const req = (url: string, persona: string = "usr_dealer_sokha", method: string = "GET", body?: any) => {
    return new NextRequest(`http://localhost:3000${url}`, {
      method,
      headers: {
        "x-khlan-persona": persona,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe("1. Vehicle Detail Page Resolution (GET /api/vehicles/[id])", () => {
    it("resolves active 10% Flash Sale on Ford Raptor 2023 with savings and countdown dates", async () => {
      const response = await getVehicleDetail(
        req("/api/vehicles/veh_raptor_2023"),
        { params: Promise.resolve({ id: "veh_raptor_2023" }) }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.vehicle).toBeDefined();

      const v = json.vehicle;
      expect(v.id).toBe("veh_raptor_2023");
      expect(v.basePriceUsd).toBe(69000);
      expect(v.effectivePriceUsd).toBe(62100);
      expect(v.isOnSale).toBe(true);

      // Verify active promotional tier details
      expect(v.activePriceType).toBeDefined();
      expect(v.activePriceType.code).toBe("FLASH_SALE");
      expect(v.activePriceType.label).toBe("Flash Sale");
      expect(v.activePriceType.badgeColor).toBe("#F97316");

      // Verify urgency & countdown dates
      expect(v.activeItemPrice).toBeDefined();
      expect(v.activeItemPrice.startDate).toBeDefined();
      expect(v.activeItemPrice.endDate).toBeDefined();
      expect(new Date(v.activeItemPrice.endDate).getTime()).toBeGreaterThan(Date.now());

      // Verify savings calculation
      expect(v.discountUsd).toBe(6900);
      expect(v.discountPercent).toBe(10);
      expect(v.floorEnforced).toBe(false);
    });

    it("enforces floor price protection on Toyota Alphard 2022 (clamped to $105,000)", async () => {
      const response = await getVehicleDetail(
        req("/api/vehicles/veh_prado_alphard"),
        { params: Promise.resolve({ id: "veh_prado_alphard" }) }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      const v = json.vehicle;

      expect(v.id).toBe("veh_prado_alphard");
      expect(v.basePriceUsd).toBe(118000);
      expect(v.floorPriceUsd).toBe(105000);
      // Candidate was 20% off ($94,400), clamped strictly to floor $105,000
      expect(v.effectivePriceUsd).toBe(105000);
      expect(v.floorEnforced).toBe(true);
      expect(v.isOnSale).toBe(true);
    });

    it("reverts expired campaign on Toyota Prius 2012 to regular base price", async () => {
      const response = await getVehicleDetail(
        req("/api/vehicles/veh_prius_2012"),
        { params: Promise.resolve({ id: "veh_prius_2012" }) }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      const v = json.vehicle;

      expect(v.id).toBe("veh_prius_2012");
      expect(v.basePriceUsd).toBe(12500);
      expect(v.effectivePriceUsd).toBe(12500);
      expect(v.isOnSale).toBe(false);
      expect(v.activePriceType).toBeNull();
    });

    it("keeps future scheduled campaign on Mazda CX-5 at regular base price", async () => {
      const response = await getVehicleDetail(
        req("/api/vehicles/veh_cx5_2023"),
        { params: Promise.resolve({ id: "veh_cx5_2023" }) }
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      const v = json.vehicle;

      expect(v.id).toBe("veh_cx5_2023");
      expect(v.basePriceUsd).toBe(33000);
      expect(v.effectivePriceUsd).toBe(33000);
      expect(v.isOnSale).toBe(false);
    });

    it("returns 404 for non-existent vehicle ID", async () => {
      const response = await getVehicleDetail(
        req("/api/vehicles/veh_non_existent"),
        { params: Promise.resolve({ id: "veh_non_existent" }) }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("2. Promotions & Pricing CRUD for Dealers & Private Sellers", () => {
    it("fetches dealer pricing inventory with active promotional metadata", async () => {
      currentMockUser = await db.user.findUnique({
        where: { id: "usr_dealer_sokha" },
        include: { sellerProfile: true },
      });

      const response = await getInventory(req("/api/seller/pricing/inventory", "usr_dealer_sokha"));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.vehicles.length).toBeGreaterThan(0);
      expect(json.totalCount).toBeGreaterThan(0);
      expect(json.onSaleCount).toBeGreaterThan(0);

      const raptor = json.vehicles.find((v: any) => v.id === "veh_raptor_2023");
      expect(raptor).toBeDefined();
      expect(raptor.effectivePriceUsd).toBe(62100);
      expect(raptor.isOnSale).toBe(true);
    });

    it("fetches private seller inventory when authenticated as private seller", async () => {
      currentMockUser = await db.user.findUnique({
        where: { id: "usr_priv_vireak" },
        include: { sellerProfile: true },
      });

      const response = await getInventory(req("/api/seller/pricing/inventory", "usr_priv_vireak"));
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.vehicles).toBeDefined();
      expect(json.vehicles.length).toBeGreaterThan(0);

      const prius = json.vehicles.find((v: any) => v.id === "veh_prius_2012");
      expect(prius).toBeDefined();
      expect(prius.effectivePriceUsd).toBe(12500);
    });

    it("supports updating listing floorPriceUsd via PATCH /api/seller/pricing/item", async () => {
      currentMockUser = await db.user.findUnique({
        where: { id: "usr_dealer_sokha" },
        include: { sellerProfile: true },
      });

      const response = await updateFloorPrice(
        req("/api/seller/pricing/item", "usr_dealer_sokha", "PATCH", {
          vehicleId: "veh_revo_2021",
          floorPriceUsd: 36000,
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.vehicle.floorPriceUsd).toBe(36000);

      // Verify in DB
      const updated = await db.vehicle.findUnique({ where: { id: "veh_revo_2021" } });
      expect(updated?.floorPriceUsd).toBe(36000);

      // Restore
      await db.vehicle.update({
        where: { id: "veh_revo_2021" },
        data: { floorPriceUsd: 35000 },
      });
    });

    it("allows creating and removing a promotion on a vehicle", async () => {
      currentMockUser = await db.user.findUnique({
        where: { id: "usr_dealer_sokha" },
        include: { sellerProfile: true },
      });

      // Find CLEARANCE price type
      const clearanceType = await db.priceType.findUnique({ where: { code: "CLEARANCE" } });
      expect(clearanceType).toBeDefined();

      // Create promo on veh_revo_2021
      const createRes = await setItemPrice(
        req("/api/seller/pricing/item", "usr_dealer_sokha", "POST", {
          vehicleId: "veh_revo_2021",
          priceTypeId: clearanceType!.id,
          value: 37500, // Fixed clearance price
        })
      );
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      expect(createJson.effectivePricing.effectivePriceUsd).toBe(37500);
      expect(createJson.effectivePricing.isOnSale).toBe(true);

      // Delete promo
      const deleteRes = await removeItemPrice(
        req("/api/seller/pricing/item?vehicleId=veh_revo_2021", "usr_dealer_sokha", "DELETE")
      );
      expect(deleteRes.status).toBe(200);

      // Verify restored to base price
      const verifyRes = await getVehicleDetail(
        req("/api/vehicles/veh_revo_2021"),
        { params: Promise.resolve({ id: "veh_revo_2021" }) }
      );
      const verifyJson = await verifyRes.json();
      expect(verifyJson.vehicle.effectivePriceUsd).toBe(39500);
      expect(verifyJson.vehicle.isOnSale).toBe(false);
    });
  });
});
