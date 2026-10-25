import { describe, it, expect } from "vitest";
import { runChecks, getReportLimitations, REPORT_LIMITATIONS } from "@/lib/report/engine";
import { fallbackSummary } from "@/lib/report/summarizer";
import { DOCUMENT_TYPES } from "@/lib/api/documents";

describe("Multi-Category AI Vehicle & Part Report Engine Tests", () => {
  describe("1. Document Types Extensibility", () => {
    it("includes PURCHASE_INVOICE and WARRANTY_CARD alongside vehicle documents", () => {
      expect(DOCUMENT_TYPES).toContain("PURCHASE_INVOICE");
      expect(DOCUMENT_TYPES).toContain("WARRANTY_CARD");
      expect(DOCUMENT_TYPES).toContain("REGISTRATION_BOOK");
      expect(DOCUMENT_TYPES).toContain("IMPORT_DECLARATION");
      expect(DOCUMENT_TYPES).toContain("SERVICE_RECORD");
      expect(DOCUMENT_TYPES).toContain("INSPECTION_CERT");
      expect(DOCUMENT_TYPES).toContain("INSURANCE");
    });
  });

  describe("2. Car AI Report Rules Engine", () => {
    const mockCar: any = {
      id: "car_camry_2020",
      listingCategory: "CAR",
      make: "Toyota",
      model: "Camry",
      year: 2020,
      priceUsd: 28000,
      mileageKm: 45000,
      bodyType: "SEDAN",
      vinLast6: "123456",
      plateNo: "2BC-9988",
      ownershipCount: 1,
      accidentDeclared: "NONE_DECLARED",
      description: "Clean Camry in great running condition. No issues.",
      descriptionKm: "ឡាន Camry ស្អាត គ្មានបញ្ហា។",
    };

    const mockDocs = [
      { type: "REGISTRATION_BOOK", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
      { type: "SERVICE_RECORD", status: "PROVIDED" },
    ];

    const mockImages = [
      { url: "https://example.com/car1.jpg" },
      { url: "https://example.com/car2.jpg" },
      { url: "https://example.com/car3.jpg" },
    ];

    const mockComps = [
      { id: "c1", bodyType: "SEDAN", year: 2020, priceUsd: 27500 },
      { id: "c2", bodyType: "SEDAN", year: 2019, priceUsd: 26000 },
      { id: "c3", bodyType: "SEDAN", year: 2021, priceUsd: 29000 },
    ];

    it("generates exactly 10 checks tailored for cars", async () => {
      const { checks, overallConfidence } = await runChecks(mockCar, mockDocs, mockImages, mockComps);
      expect(checks).toHaveLength(10);
      expect(overallConfidence).toBeGreaterThan(60);

      const identityCheck = checks.find((c) => c.area === "identity");
      expect(identityCheck?.title).toBe("Vehicle identity");
      expect(identityCheck?.titleKm).toBe("អត្តសញ្ញាណរថយន្ត");
      expect(identityCheck?.detail).toContain("123456");

      const regCheck = checks.find((c) => c.area === "registration");
      expect(regCheck?.status).toBe("VERIFIED");

      const mileageCheck = checks.find((c) => c.area === "mileage");
      // 45000 / 5 years = 9000 km/yr (within 4000-25000)
      expect(mileageCheck?.status).toBe("EVIDENCE_FOUND");

      const priceCheck = checks.find((c) => c.area === "price");
      expect(priceCheck?.status).toBe("EVIDENCE_FOUND");
    });

    it("flags suspiciously low car mileage as inconsistent", async () => {
      const lowMileageCar = { ...mockCar, year: 2015, mileageKm: 5000 }; // 500 km/yr < 4000
      const { checks } = await runChecks(lowMileageCar, [], mockImages);
      const mileageCheck = checks.find((c) => c.area === "mileage");
      expect(mileageCheck?.status).toBe("INCONSISTENT");
      expect(mileageCheck?.detail).toContain("possible odometer rollback");
    });

    it("returns car limitations", () => {
      const limits = getReportLimitations("CAR");
      expect(limits).toHaveLength(3);
      expect(limits[0].en).toContain("physical inspection");
    });
  });

  describe("3. Motorcycle AI Report Rules Engine", () => {
    const mockMotor: any = {
      id: "motor_dream_125",
      listingCategory: "MOTOR",
      make: "Honda",
      model: "Dream 125",
      year: 2023,
      priceUsd: 2650,
      mileageKm: 3500,
      bodyType: "CUB",
      engineCc: 125,
      plateNo: "1KB-8899",
      vinLast6: "778899",
      ownershipCount: 1,
      accidentDeclared: "NONE_DECLARED",
      description: "Original Honda Dream 125 with registered card.",
      descriptionKm: "Honda Dream 125 ហ្ស៊ីន មានកាតគ្រី។",
    };

    const mockDocs = [{ type: "REGISTRATION_BOOK", status: "VERIFIED" }];
    const mockImages = [
      { url: "https://example.com/m1.jpg" },
      { url: "https://example.com/m2.jpg" },
      { url: "https://example.com/m3.jpg" },
    ];
    const mockComps = [
      { id: "m1", bodyType: "CUB", year: 2023, priceUsd: 2600 },
      { id: "m2", bodyType: "CUB", year: 2022, priceUsd: 2450 },
      { id: "m3", bodyType: "CUB", year: 2024, priceUsd: 2750 },
    ];

    it("generates exactly 10 checks tailored for motorcycles with motor-specific titles", async () => {
      const { checks, overallConfidence } = await runChecks(mockMotor, mockDocs, mockImages, mockComps);
      expect(checks).toHaveLength(10);
      expect(overallConfidence).toBeGreaterThanOrEqual(50);

      const identityCheck = checks.find((c) => c.area === "identity");
      expect(identityCheck?.title).toBe("Motorcycle identity");
      expect(identityCheck?.titleKm).toBe("អត្តសញ្ញាណម៉ូតូ");
      expect(identityCheck?.detail).toContain("125cc");
      expect(identityCheck?.detail).toContain("1KB-8899");

      const regCheck = checks.find((c) => c.area === "registration");
      expect(regCheck?.title).toBe("Motorcycle card (កាតគ្រី)");
      expect(regCheck?.titleKm).toBe("កាតគ្រីម៉ូតូ");
      expect(regCheck?.status).toBe("VERIFIED");

      const mileageCheck = checks.find((c) => c.area === "mileage");
      expect(mileageCheck?.title).toBe("Motorcycle mileage");
      // 3500 / 2 years = 1750 km/yr (< 2000 km/yr triggers low motorcycle mileage inspection)
      expect(mileageCheck?.status).toBe("INCONSISTENT");
    });

    it("verifies plausible commuter annual mileage for motorcycles (2k-15k km/yr)", async () => {
      const plausibleMotor = { ...mockMotor, mileageKm: 8000, year: 2023 }; // 4000 km/yr
      const { checks } = await runChecks(plausibleMotor, mockDocs, mockImages, mockComps);
      const mileageCheck = checks.find((c) => c.area === "mileage");
      expect(mileageCheck?.status).toBe("EVIDENCE_FOUND");
      expect(mileageCheck?.detail).toContain("typical for motorcycle commuting in Cambodia");
    });

    it("returns motorcycle-specific limitations", () => {
      const limits = getReportLimitations("MOTOR");
      expect(limits).toHaveLength(3);
      expect(limits[0].en).toContain("motorcycle listing details");
      expect(limits[2].en).toContain("frame and engine numbers directly against the physical registration card");
    });
  });

  describe("4. Spare Parts AI Report Rules Engine", () => {
    const mockPart: any = {
      id: "part_toyota_pads",
      listingCategory: "SPARE_PART",
      partCategory: "BRAKES_SUSPENSION",
      partTarget: "CAR",
      partCondition: "BRAND_NEW",
      partNumber: "04465-47060",
      compatibleModels: "Toyota Prius 2004-2015, Corolla 2008-2019",
      make: "Toyota Genuine Parts",
      model: "Front Ceramic Brake Pads",
      year: 2024,
      priceUsd: 38,
      mileageKm: 0,
      condition: "USED",
      accidentDeclared: "NONE_DECLARED",
      seller: {
        verified: true,
        sellerProfile: { shopName: "Sokha Auto Parts", verified: true, type: "DEALER" },
      },
      description: "Authentic Toyota genuine ceramic brake pads in sealed box.",
      descriptionKm: "ស្បែកហ្វ្រាំង Toyota សុទ្ធក្នុងប្រអប់បិទជិត។",
    };

    const mockDocs = [
      { type: "PURCHASE_INVOICE", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
      { type: "WARRANTY_CARD", status: "PROVIDED" },
    ];

    const mockImages = [
      { url: "https://example.com/part1.jpg" },
      { url: "https://example.com/part2.jpg" },
      { url: "https://example.com/part3.jpg" },
    ];

    const mockPartComps = [
      { id: "p1", partCategory: "BRAKES_SUSPENSION", partTarget: "CAR", year: 2024, priceUsd: 35 },
      { id: "p2", partCategory: "BRAKES_SUSPENSION", partTarget: "CAR", year: 2024, priceUsd: 40 },
      { id: "p3", partCategory: "BRAKES_SUSPENSION", partTarget: "CAR", year: 2023, priceUsd: 38 },
    ];

    it("generates 10 checks tailored for spare parts with OEM identity and invoice verification", async () => {
      const { checks, overallConfidence } = await runChecks(mockPart, mockDocs, mockImages, mockPartComps);
      expect(checks).toHaveLength(10);
      expect(overallConfidence).toBeGreaterThan(70);

      // 1. Identity: Part Number & Compatibility
      const idCheck = checks.find((c) => c.area === "identity");
      expect(idCheck?.title).toBe("Part number & fitment");
      expect(idCheck?.titleKm).toBe("លេខកូដគ្រឿងបន្លាស់និងភាពត្រូវគ្នា");
      expect(idCheck?.status).toBe("EVIDENCE_FOUND");
      expect(idCheck?.detail).toContain("04465-47060");
      expect(idCheck?.detail).toContain("Toyota Prius");

      // 2. Registration -> Invoice / Proof of Purchase
      const invCheck = checks.find((c) => c.area === "registration");
      expect(invCheck?.title).toBe("Invoice & purchase receipt");
      expect(invCheck?.titleKm).toBe("វិក្កយបត្រទិញនិងបង្កាន់ដៃ");
      expect(invCheck?.status).toBe("VERIFIED");

      // 3. Import / Origin
      const impCheck = checks.find((c) => c.area === "import");
      expect(impCheck?.title).toBe("Origin & distributor seal");
      expect(impCheck?.status).toBe("VERIFIED");

      // 4. Mileage -> Condition & Wear status (BRAND_NEW)
      const condCheck = checks.find((c) => c.area === "mileage");
      expect(condCheck?.title).toBe("Condition & wear status");
      expect(condCheck?.status).toBe("EVIDENCE_FOUND");
      expect(condCheck?.detail).toContain("BRAND NEW");

      // 5. Price vs Spare Part Market
      const priceCheck = checks.find((c) => c.area === "price");
      expect(priceCheck?.title).toBe("Price vs. part market");
      expect(priceCheck?.status).toBe("EVIDENCE_FOUND");
      expect(priceCheck?.detail).toContain("$38");

      // 6. Service -> Warranty Card
      const warCheck = checks.find((c) => c.area === "service");
      expect(warCheck?.title).toBe("Warranty & test cert");
      expect(warCheck?.status).toBe("EVIDENCE_FOUND");

      // 8. Ownership -> Supplier Credibility
      const suppCheck = checks.find((c) => c.area === "ownership");
      expect(suppCheck?.title).toBe("Supplier credibility");
      expect(suppCheck?.status).toBe("EVIDENCE_FOUND");
      expect(suppCheck?.detail).toContain("Sokha Auto Parts");
    });

    it("evaluates USED_GENUINE part condition properly", async () => {
      const usedPart = { ...mockPart, partCondition: "USED_GENUINE" };
      const { checks } = await runChecks(usedPart, mockDocs, mockImages, mockPartComps);
      const condCheck = checks.find((c) => c.area === "mileage");
      expect(condCheck?.status).toBe("EVIDENCE_FOUND");
      expect(condCheck?.detail).toContain("USED GENUINE");
    });

    it("flags suspiciously cheap replica part price", async () => {
      const fakePricedPart = { ...mockPart, priceUsd: 10 }; // $10 vs $38 median (ratio = 0.26 < 0.65)
      const { checks } = await runChecks(fakePricedPart, mockDocs, mockImages, mockPartComps);
      const priceCheck = checks.find((c) => c.area === "price");
      expect(priceCheck?.status).toBe("INCONSISTENT");
      expect(priceCheck?.detail).toContain("counterfeit replica");
    });

    it("returns spare part tailored limitations", () => {
      const limits = getReportLimitations("SPARE_PART");
      expect(limits).toHaveLength(3);
      expect(limits[0].en).toContain("part OEM numbers, compatibility fitment");
      expect(limits[2].en).toContain("mechanic before unboxing or installation");
    });
  });

  describe("5. Fallback Summarizer Multi-Category Language", () => {
    it("generates category-aware fallback summary for spare parts", () => {
      const checks = [
        {
          area: "identity",
          title: "Part number & fitment",
          titleKm: "លេខកូដគ្រឿងបន្លាស់",
          status: "EVIDENCE_FOUND" as const,
          detail: "OEM verified",
          detailKm: "OEM បញ្ជាក់",
          source: "Catalog",
          confidence: 0.9,
        },
        {
          area: "registration",
          title: "Invoice & purchase receipt",
          titleKm: "វិក្កយបត្រទិញ",
          status: "VERIFIED" as const,
          detail: "Invoice verified",
          detailKm: "វិក្កយបត្របានផ្ទៀងផ្ទាត់",
          source: "Invoice",
          confidence: 0.95,
        },
      ];

      const { summaryEn, summaryKm } = fallbackSummary(checks, "SPARE_PART");
      expect(summaryEn).toContain("evidence checks for this part");
      expect(summaryKm).toContain("ផ្អែកលើការវិភាគភស្តុតាង 2 ចំណុច");
    });
  });
});
