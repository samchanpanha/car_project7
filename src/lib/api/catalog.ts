import { db } from "@/lib/db";
import {
  getVehicleMakes as getFallbackMakes,
  getVehicleModels as getFallbackModels,
  getPartManufacturers as getFallbackPartMakes,
  getPartModels as getFallbackPartModels,
  type VehicleCatalogCategory,
} from "@/lib/vehicle-catalog";

export function normalizeCatalogCategory(category: string = "CAR"): "CAR" | "MOTOR" | "SPARE_PART" | "ALL" {
  const upper = (category || "CAR").toUpperCase().trim();
  if (upper === "ALL") return "ALL";
  if (upper === "MOTORCYCLE" || upper === "MOTOR" || upper === "MOTO" || upper === "BIKE") return "MOTOR";
  if (upper === "SPARE_PART" || upper === "SPARE_PARTS" || upper === "PARTS" || upper === "PART") return "SPARE_PART";
  return "CAR";
}

/**
 * Returns the list of unique makes for a category (CAR, MOTOR, SPARE_PART).
 * Queries the database vehicle_makes table, falling back to in-memory defaults if empty.
 */
export async function getCatalogMakes(category: string = "CAR"): Promise<string[]> {
  const normCategory = normalizeCatalogCategory(category);

  try {
    const records = await db.vehicleMake.findMany({
      where: normCategory === "ALL" ? undefined : { category: normCategory },
      orderBy: { name: "asc" },
      select: { name: true },
    });

    if (records.length > 0) {
      return records.map((r) => r.name);
    }
  } catch (err) {
    // Database query failed, fallback gracefully
  }

  // Fallback
  if (normCategory === "SPARE_PART") {
    return getFallbackPartMakes();
  }
  const cat: VehicleCatalogCategory = normCategory === "MOTOR" ? "MOTOR" : "CAR";
  return getFallbackMakes(cat);
}

/**
 * Returns models for a specific make and category.
 * Used by dependent Make -> Model dropdowns.
 */
export async function getCatalogModels(
  category: string = "CAR",
  makeName: string,
): Promise<string[]> {
  if (!makeName || makeName.trim() === "" || makeName.toLowerCase() === "all") {
    return [];
  }

  const normCategory = normalizeCatalogCategory(category);
  const trimmedMake = makeName.trim();

  try {
    // Find make by case-insensitive name and category
    const make = await db.vehicleMake.findFirst({
      where: {
        category: normCategory === "ALL" ? undefined : normCategory,
        name: { equals: trimmedMake, mode: "insensitive" },
      },
      include: {
        models: {
          orderBy: { name: "asc" },
          select: { name: true },
        },
      },
    });

    if (make && make.models.length > 0) {
      return make.models.map((m) => m.name);
    }
  } catch (err) {
    // Fallback on DB failure
  }

  // Fallback
  if (normCategory === "SPARE_PART") {
    return getFallbackPartModels();
  }
  const cat: VehicleCatalogCategory = normCategory === "MOTOR" ? "MOTOR" : "CAR";
  return getFallbackModels(cat, trimmedMake);
}

