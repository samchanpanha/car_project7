import { describe, it, expect } from "vitest";
import { getCatalogMakes, getCatalogModels } from "@/lib/api/catalog";
import { importCatalogModels, fetchNhtsaModelsForMake } from "../scripts/import-vehicle-models";

describe("Catalog Dependent Dropdowns & Maintained Source Importer", () => {
  describe("1. Category-Aware Makes Discovery", () => {
    it("returns comprehensive list of Car makes", async () => {
      const carMakes = await getCatalogMakes("CAR");
      expect(carMakes).toContain("Toyota");
      expect(carMakes).toContain("Lexus");
      expect(carMakes).toContain("Honda");
      expect(carMakes).toContain("Ford");
    });

    it("returns comprehensive list of Motorcycle makes", async () => {
      const motorMakes = await getCatalogMakes("MOTOR");
      expect(motorMakes).toContain("Honda");
      expect(motorMakes).toContain("Yamaha");
      expect(motorMakes).toContain("Kawasaki");
      expect(motorMakes).toContain("Suzuki");
    });

    it("returns Spare Part manufacturers and brands", async () => {
      const partMakes = await getCatalogMakes("SPARE_PART");
      expect(partMakes).toContain("Brembo");
      expect(partMakes).toContain("Bosch");
      expect(partMakes).toContain("Denso");
      expect(partMakes).toContain("Michelin");
    });
  });

  describe("2. Dependent Make -> Model Resolution", () => {
    it("returns models specifically for Toyota Cars", async () => {
      const models = await getCatalogModels("CAR", "Toyota");
      expect(models).toContain("Camry");
      expect(models).toContain("Corolla");
      expect(models).toContain("Land Cruiser");
      expect(models).toContain("Prius");
    });

    it("returns motorcycle models specifically for Honda Motors", async () => {
      const models = await getCatalogModels("MOTOR", "Honda");
      expect(models).toContain("Dream 125");
      expect(models).toContain("Click 160");
      expect(models).toContain("Scoopy");
    });

    it("returns spare part components specifically for Brembo", async () => {
      const models = await getCatalogModels("SPARE_PART", "Brembo");
      expect(models).toContain("Brake Pads");
    });

    it("returns empty array when make is unknown or invalid", async () => {
      const models = await getCatalogModels("CAR", "NonExistentMakeXYZ");
      expect(models).toEqual([]);
    });

    it("returns empty array when make is 'ALL' or empty", async () => {
      const models = await getCatalogModels("CAR", "ALL");
      expect(models).toEqual([]);

      const empty = await getCatalogModels("CAR", "");
      expect(empty).toEqual([]);
    });
  });

  describe("3. Re-runnable Importer & NHTSA vPIC Integration", () => {
    it("runs importer in dryRun mode safely without DB mutation", async () => {
      const stats = await importCatalogModels({
        category: "CAR",
        make: "Toyota",
        dryRun: true,
        verbose: false,
      });

      expect(stats.totalMakes).toBe(1);
      expect(stats.totalModels).toBeGreaterThan(10);
      expect(stats.dryRun).toBe(true);
    });
  });
});

