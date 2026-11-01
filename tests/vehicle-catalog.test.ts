import { describe, expect, it } from "vitest";
import {
  getCompatibleVehicleModels,
  getPartManufacturers,
  getPartModels,
  getVehicleMakes,
  getVehicleModels,
} from "@/lib/vehicle-catalog";

describe("vehicle catalog defaults", () => {
  it("provides car makes and make-specific models", () => {
    expect(getVehicleMakes("CAR")).toContain("Toyota");
    expect(getVehicleModels("CAR", "toyota")).toContain("Land Cruiser Prado");
    expect(getVehicleModels("CAR", "unknown make")).toEqual([]);
  });

  it("provides motorcycle makes and make-specific models", () => {
    expect(getVehicleMakes("MOTOR")).toContain("Yamaha");
    expect(getVehicleModels("MOTOR", "Honda")).toContain("Dream 125");
  });

  it("includes existing and spare-part manufacturers and common part names", () => {
    expect(getPartManufacturers(["Custom Brand"])).toContain("Custom Brand");
    expect(getPartManufacturers()).toContain("Michelin");
    expect(getPartModels()).toContain("Brake Pads");
  });

  it("provides category-aware compatible vehicle suggestions", () => {
    expect(getCompatibleVehicleModels("CAR")).toContain("Toyota Land Cruiser Prado");
    expect(getCompatibleVehicleModels("MOTOR")).toContain("Honda Dream 125");
    expect(getCompatibleVehicleModels("UNIVERSAL")).toContain("Honda CR-V");
    expect(getCompatibleVehicleModels("UNIVERSAL")).toContain("Honda Dream 125");
  });
});
