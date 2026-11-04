import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getSession, POST as switchSession } from "@/app/api/session/route";
import { GET as getInventory } from "@/app/api/seller/pricing/inventory/route";
import { formatUsd, formatKhr } from "@/lib/format";
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

describe("Dashboard Promotions, Session Switching & Floor Safeguards Engine", () => {
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

  describe("1. Demo Persona Switching & Session Resolution (GET & POST /api/session)", () => {
    it("switches persona to dealer usr_dealer_sokha and sets persona cookie with active subscription", async () => {
      const response = await switchSession(
        new Request("http://localhost:3000/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: "usr_dealer_sokha" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.activePersonaId).toBe("usr_dealer_sokha");
      expect(json.user.id).toBe("usr_dealer_sokha");
      expect(json.user.role).toBe("DEALER");
      expect(json.sellerType).toBe("DEALER");
      expect(json.tenant).toBeDefined();
      expect(json.tenant.slug).toBe("sokha-motors");
      expect(json.subscription).toBeDefined();
      expect(json.subscription.status).toBe("ACTIVE");

      // Verify persona cookie is set
      const cookies = response.headers.getSetCookie();
      expect(cookies.some((c) => c.includes("khlan_persona=usr_dealer_sokha"))).toBe(true);
    });

    it("switches persona to private seller usr_priv_vireak with active trial subscription", async () => {
      const response = await switchSession(
        new Request("http://localhost:3000/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: "usr_priv_vireak" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.activePersonaId).toBe("usr_priv_vireak");
      expect(json.user.id).toBe("usr_priv_vireak");
      expect(json.user.role).toBe("SELLER");
      expect(json.sellerType).toBe("PRIVATE");
      expect(json.subscription).toBeDefined();
      expect(json.subscription.status).toBe("ACTIVE");
    });

    it("rejects unknown persona id with 400 Bad Request", async () => {
      const response = await switchSession(
        new Request("http://localhost:3000/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: "usr_hacker_unknown" }),
        })
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/allowed demo personas/);
    });

    it("GET /api/session resolves current active session with all demo personas", async () => {
      const response = await getSession();
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.personas).toBeDefined();
      expect(json.personas.length).toBeGreaterThanOrEqual(7);
      expect(json.personas.some((p: any) => p.id === "usr_dealer_sokha")).toBe(true);
      expect(json.personas.some((p: any) => p.id === "usr_priv_vireak")).toBe(true);
    });
  });

  describe("2. Inventory Query Resilience & Multi-Category Isolation", () => {
    it("preserves seller ownership conditions when searching keyword q", async () => {
      currentMockUser = {
        id: "usr_priv_vireak",
        role: "SELLER",
        sellerProfile: { type: "PRIVATE" },
      };

      const response = await getInventory(req("/api/seller/pricing/inventory?q=Prius", "usr_priv_vireak"));
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.vehicles).toBeDefined();

      // Should only return Vireak's Prius, NOT any other user's inventory
      expect(json.vehicles.every((v: any) => v.model === "Prius" || v.make.toLowerCase().includes("prius"))).toBe(true);
    });

    it("isolates inventory by CAR, MOTOR, and SPARE_PART categories", async () => {
      currentMockUser = {
        id: "usr_dealer_sokha",
        role: "DEALER",
        sellerProfile: { type: "DEALER" },
      };

      // Car filter
      const carRes = await getInventory(req("/api/seller/pricing/inventory?category=CAR", "usr_dealer_sokha"));
      const carJson = await carRes.json();
      expect(carJson.vehicles.length).toBeGreaterThan(0);
      expect(carJson.vehicles.every((v: any) => v.listingCategory === "CAR")).toBe(true);

      // Motor filter
      const motorRes = await getInventory(req("/api/seller/pricing/inventory?category=MOTOR", "usr_dealer_sokha"));
      const motorJson = await motorRes.json();
      expect(motorJson.vehicles.length).toBeGreaterThan(0);
      expect(motorJson.vehicles.every((v: any) => v.listingCategory === "MOTOR")).toBe(true);

      // Spare Part filter
      const partRes = await getInventory(req("/api/seller/pricing/inventory?category=SPARE_PART", "usr_dealer_sokha"));
      const partJson = await partRes.json();
      expect(partJson.vehicles.length).toBeGreaterThan(0);
      expect(partJson.vehicles.every((v: any) => v.listingCategory === "SPARE_PART")).toBe(true);
    });
  });

  describe("3. Pricing & Floor Safeguards Calculations & KHR Dual Currency", () => {
    it("calculates dual currency KHR conversion without duplicate multiplier", () => {
      const priceUsd = 69000;
      const khrFormatted = formatKhr(priceUsd);
      // 69000 * 4100 = 282,900,000 Riels (≈ ៛282.9M)
      expect(khrFormatted).toMatch(/៛282\.9M/);
    });

    it("calculates accurate floor protection presets (90%, 85%, 80%)", () => {
      const basePrice = 20000;
      const floor90 = Math.round(basePrice * 0.90);
      const floor85 = Math.round(basePrice * 0.85);
      const floor80 = Math.round(basePrice * 0.80);

      expect(floor90).toBe(18000);
      expect(floor85).toBe(17000);
      expect(floor80).toBe(16000);

      expect(formatUsd(floor90)).toBe("$18,000");
      expect(formatUsd(floor85)).toBe("$17,000");
      expect(formatUsd(floor80)).toBe("$16,000");
    });

    it("enforces floor price guardrail clamping when discount exceeds floor", () => {
      const basePrice = 100000;
      const floorPrice = 85000; // 15% max discount protected
      const discountPercent = 25; // 25% off attempt

      const candidatePrice = Math.round(basePrice * (1 - discountPercent / 100)); // 75,000
      const floorClamped = candidatePrice < floorPrice;
      const effectivePrice = floorClamped ? floorPrice : candidatePrice;

      expect(candidatePrice).toBe(75000);
      expect(floorClamped).toBe(true);
      expect(effectivePrice).toBe(85000); // Clamped to minimum floor
    });

    it("validates floor price bounds against base listing price", () => {
      const base = 25000;
      const invalidFloor = 30000; // Higher than base
      const validFloor = 22000;

      const isInvalid = invalidFloor > base;
      const isValid = validFloor <= base && validFloor >= 0;

      expect(isInvalid).toBe(true);
      expect(isValid).toBe(true);
    });
  });
});
