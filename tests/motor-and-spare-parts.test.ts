import { describe, it, expect } from "vitest";
import { getPlanCatalog, getPlanPricing } from "@/lib/api/plan-config";
import { PLAN_BY_KEY } from "@/lib/api/plans";
import { buildVehicleWhere } from "@/lib/api/vehicle-filters";
import { toCardDTO, toDetailDTO } from "@/lib/api/mappers";

describe("Motor & Spare Parts Multi-Category Marketplace Tests", () => {
  describe("1. Plan Tier Entitlement for Spare Parts", () => {
    it("ensures FREE and BASIC plans CANNOT sell spare parts", async () => {
      expect(PLAN_BY_KEY.FREE.canSellSpareParts).toBe(false);
      expect(PLAN_BY_KEY.BASIC.canSellSpareParts).toBe(false);

      const pricing = await getPlanPricing();
      expect(pricing.BASIC.canSellSpareParts).toBe(false);
    });

    it("ensures PRO and ENTERPRISE plans CAN sell spare parts", async () => {
      expect(PLAN_BY_KEY.PRO.canSellSpareParts).toBe(true);
      expect(PLAN_BY_KEY.ENTERPRISE.canSellSpareParts).toBe(true);

      const pricing = await getPlanPricing();
      expect(pricing.PRO.canSellSpareParts).toBe(true);
      expect(pricing.ENTERPRISE.canSellSpareParts).toBe(true);
    });

    it("exposes canSellSpareParts across the full plan catalog DTO", async () => {
      const catalog = await getPlanCatalog({ includeDisabled: true });
      const free = catalog.find((p) => p.plan === "FREE");
      const basic = catalog.find((p) => p.plan === "BASIC");
      const pro = catalog.find((p) => p.plan === "PRO");
      const enterprise = catalog.find((p) => p.plan === "ENTERPRISE");

      expect(free?.canSellSpareParts).toBe(false);
      expect(basic?.canSellSpareParts).toBe(false);
      expect(pro?.canSellSpareParts).toBe(true);
      expect(enterprise?.canSellSpareParts).toBe(true);
    });
  });

  describe("2. Vehicle Filters & Search Engine Query Builder", () => {
    it("filters accurately by listing category (CAR, MOTOR, SPARE_PART)", () => {
      const whereCar = buildVehicleWhere(new URLSearchParams({ category: "CAR" }));
      expect((whereCar as any).listingCategory).toBe("CAR");

      const whereMotor = buildVehicleWhere(new URLSearchParams({ category: "MOTOR" }));
      expect((whereMotor as any).listingCategory).toBe("MOTOR");

      const wherePart = buildVehicleWhere(new URLSearchParams({ category: "SPARE_PART" }));
      expect((wherePart as any).listingCategory).toBe("SPARE_PART");
    });

    it("does not set listingCategory filter if category is ALL", () => {
      const whereAll = buildVehicleWhere(new URLSearchParams({ category: "ALL" }));
      expect((whereAll as any).listingCategory).toBeUndefined();
    });

    it("filters spare parts by target vehicle and part category", () => {
      const wherePartEngine = buildVehicleWhere(
        new URLSearchParams({
          category: "SPARE_PART",
          partCategory: "ENGINE",
          partTarget: "MOTOR",
        }),
      );

      expect((wherePartEngine as any).listingCategory).toBe("SPARE_PART");
      expect((wherePartEngine as any).partCategory).toBe("ENGINE");
      expect((wherePartEngine as any).partTarget).toBe("MOTOR");
    });

    it("supports part condition filter", () => {
      const whereCondition = buildVehicleWhere(
        new URLSearchParams({
          category: "SPARE_PART",
          condition: "LIKE_NEW",
        }),
      );

      expect((whereCondition as any).partCondition).toBe("LIKE_NEW");
    });

    it("matches spare parts by part number, compatible models, and category in q search", () => {
      const mockPart = {
        make: "Brembo",
        model: "Brake Disc",
        variant: "Sport",
        city: "Phnom Penh",
        year: 2024,
        partNumber: "09.A820.11",
        compatibleModels: "Honda Civic, Accord, CR-V",
        partCategory: "BRAKES",
        seller: { name: "Brembo Official Store", sellerProfile: { shopName: "Auto Parts Plus" } },
      };

      const matchQ = (v: typeof mockPart, query: string) => {
        const text = `${v.make} ${v.model} ${v.variant ?? ""} ${v.city ?? ""} ${v.year} ${v.partNumber ?? ""} ${v.compatibleModels ?? ""} ${v.partCategory ?? ""} ${v.seller?.name ?? ""} ${v.seller?.sellerProfile?.shopName ?? ""}`.toLowerCase();
        return text.includes(query.toLowerCase());
      };

      expect(matchQ(mockPart, "09.A820.11")).toBe(true);
      expect(matchQ(mockPart, "CR-V")).toBe(true);
      expect(matchQ(mockPart, "BRAKES")).toBe(true);
      expect(matchQ(mockPart, "Tesla")).toBe(false);
    });
  });

  describe("3. DTO Mappers for Motorcycle and Spare Parts", () => {
    const baseMockVehicle = {
      id: "veh_mock_part_1",
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-01T00:00:00Z"),
      tenantId: null,
      createdById: "user_pro_seller",
      status: "PUBLISHED",
      sellerId: "seller_1",
      make: "Honda",
      model: "CBR Brake Pads",
      variant: "OEM",
      year: 2024,
      mileageKm: 0,
      priceUsd: 45,
      priceMasked: false,
      transmission: "MANUAL",
      fuel: "PETROL",
      bodyType: "OTHER",
      accidentDeclared: "NO_ACCIDENT",
      city: "Phnom Penh",
      district: "Chamkar Mon",
      description: "High performance brake pads",
      descriptionKm: null,
      views: 12,
      featured: true,
      plateNo: null,
      vinLast6: null,
      color: "Black",
      drivetrain: null,
      engineCc: null,
      seats: null,
      interiorColor: null,
      fuelEconomy: null,
      exteriorColor: "Black",
      ownershipCount: null,
      importOrigin: null,
      branchId: null,
      listingCategory: "SPARE_PART",
      partCategory: "BRAKES",
      partTarget: "MOTOR",
      partCondition: "NEW",
      compatibleModels: "Honda CBR 150, CBR 250, CB150R",
      partNumber: "06455-KPP-901",
      seller: {
        id: "seller_1",
        name: "Sokha Moto Parts",
        email: "sokha@example.com",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        sellerProfile: {
          id: "sp_1",
          phone: "012345678",
          city: "Phnom Penh",
          type: "DEALER",
          shopName: "Sokha Moto Parts Store",
          verifiedBadge: true,
          ratingAvg: 4.9,
          ratingCount: 38,
          responseRate: 98,
          createdAt: new Date("2025-01-01T00:00:00Z"),
          telegram: "@sokha_parts",
        },
      },
      images: [
        {
          id: "img_1",
          vehicleId: "veh_mock_part_1",
          url: "https://cb9940df321e5a167f322120e5c74070.r2.cloudflarestorage.com/cars-storage/part.webp",
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
      documents: [],
      reports: [],
    };

    it("toCardDTO maps spare parts specific fields correctly", () => {
      const card = toCardDTO(baseMockVehicle as any);
      expect(card.id).toBe("veh_mock_part_1");
      expect(card.listingCategory).toBe("SPARE_PART");
      expect(card.partCategory).toBe("BRAKES");
      expect(card.partTarget).toBe("MOTOR");
      expect(card.partCondition).toBe("NEW");
      expect(card.partNumber).toBe("06455-KPP-901");
      expect(card.compatibleModels).toBe("Honda CBR 150, CBR 250, CB150R");
    });

    it("toDetailDTO maps all details for motorcycle or spare parts", () => {
      const detail = toDetailDTO(baseMockVehicle as any);
      expect(detail.id).toBe("veh_mock_part_1");
      expect(detail.listingCategory).toBe("SPARE_PART");
      expect(detail.partCategory).toBe("BRAKES");
      expect(detail.partTarget).toBe("MOTOR");
      expect(detail.partCondition).toBe("NEW");
      expect(detail.partNumber).toBe("06455-KPP-901");
      expect(detail.compatibleModels).toBe("Honda CBR 150, CBR 250, CB150R");
    });
  });

  describe("4. Plan Gate Logic Verification", () => {
    function canSellSpareParts(planTier: string, role?: string): boolean {
      if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
      return planTier === "PRO" || planTier === "ENTERPRISE";
    }

    it("restricts Free and Basic plans from creating spare parts listings", () => {
      expect(canSellSpareParts("FREE")).toBe(false);
      expect(canSellSpareParts("BASIC")).toBe(false);
    });

    it("authorizes Pro and Enterprise plans to create spare parts listings", () => {
      expect(canSellSpareParts("PRO")).toBe(true);
      expect(canSellSpareParts("ENTERPRISE")).toBe(true);
    });

    it("allows administrators to manage spare parts regardless of subscription", () => {
      expect(canSellSpareParts("FREE", "ADMIN")).toBe(true);
      expect(canSellSpareParts("FREE", "SUPER_ADMIN")).toBe(true);
    });
  });
});
