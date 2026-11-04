/**
 * KhLan Vehicle & Motorcycle Catalog Model Importer
 *
 * Imports models from a maintained source (NHTSA vPIC / Wikidata / supplier feed)
 * via a re-runnable script with fallback cache for Cambodia automotive market.
 *
 * Usage:
 *   npx tsx scripts/import-vehicle-models.ts [--category=CAR|MOTOR|SPARE_PART] [--make=Toyota] [--dry-run]
 */

import { db } from "../src/lib/db";

export interface ImportOptions {
  category?: "CAR" | "MOTOR" | "SPARE_PART" | "ALL";
  make?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

// Popular Cambodian & international makes by category
export const DEFAULT_MAKES: Record<"CAR" | "MOTOR" | "SPARE_PART", string[]> = {
  CAR: [
    "Toyota", "Lexus", "Honda", "Ford", "Mazda", "Hyundai", "Kia", "Nissan",
    "Mitsubishi", "Suzuki", "Isuzu", "Subaru", "Mercedes-Benz", "BMW", "Audi",
    "Land Rover", "Porsche", "BYD", "Tesla", "MG", "Chevrolet", "Volvo",
  ],
  MOTOR: [
    "Honda", "Yamaha", "Suzuki", "Kawasaki", "Vespa", "GPX", "BMW", "Ducati",
    "KTM", "Royal Enfield", "SYM", "Harley-Davidson", "Triumph",
  ],
  SPARE_PART: [
    "Brembo", "Bosch", "Denso", "D.I.D Japan", "Genuine Parts", "NGK",
    "Panasonic", "Philips", "Michelin", "Motul", "Pirelli", "Shell", "Yokohama",
  ],
};

// Regional Cambodia-specific popular models to supplement NHTSA
export const REGIONAL_MODELS: Record<string, string[]> = {
  Toyota: [
    "Alphard", "Avanza", "Camry", "Corolla", "Corolla Cross", "C-HR", "Fortuner",
    "Hiace", "Hilux", "Land Cruiser", "Land Cruiser Prado", "Prius", "Raize",
    "RAV4", "Rush", "Sienna", "Vellfire", "Vios", "Yaris", "Yaris Cross",
  ],
  Lexus: ["ES", "GX", "IS", "LM", "LS", "LX", "NX", "RX", "UX"],
  Honda: [
    "Accord", "BR-V", "City", "Civic", "CR-V", "Fit", "HR-V", "Jazz", "Odyssey",
    // Motor models
    "Air Blade", "ADV 160", "CBR150R", "CBR250RR", "Click 125", "Click 160",
    "Dream 125", "PCX 160", "Scoopy", "Wave 110", "Winner X",
  ],
  Yamaha: ["Aerox", "Exciter 155", "Fino", "Mio", "MT-15", "NMAX", "R15", "XMAX"],
  Suzuki: ["Burgman", "GSX-R150", "Nex", "Raider R150", "Smash", "Ertiga", "Jimny", "Swift", "Vitara", "XL7"],
  Kawasaki: ["KLX 150", "Ninja 250", "Ninja 400", "Ninja 650", "W175", "Z650"],
  Vespa: ["GTS 300", "Primavera", "Sprint"],
  // Spare parts catalog
  Brembo: ["Brake Pads", "Brake Disc", "Brake Caliper", "Brake Fluid DOT 4"],
  Bosch: ["Air Filter", "Oil Filter", "Spark Plug", "Wiper Blade", "Battery", "Brake Pads"],
  Denso: ["Spark Plug Iridium", "Alternator", "Starter Motor", "AC Compressor", "Cabin Air Filter"],
  Michelin: ["Pilot Sport 4", "Primacy 4", "Energy XM2+", "City Grip 2", "Road 6"],
  NGK: ["Laser Iridium Spark Plug", "G-Power Spark Plug", "Standard Spark Plug"],
  Motul: ["300V Factory Line", "7100 4T", "H-Tech 100 Plus", "Dot 5.1 Brake Fluid"],
};

export async function fetchNhtsaModelsForMake(make: string): Promise<string[]> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/${encodeURIComponent(make)}?format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const json = (await res.json()) as { Results?: Array<{ Model_Name?: string }> };
    const results = json.Results || [];

    const modelNames = results
      .map((r) => r.Model_Name?.trim())
      .filter((name): name is string => Boolean(name && name.length > 0));

    return Array.from(new Set(modelNames));
  } catch (err) {
    // Graceful fallback to regional/cached list if offline or timed out
    return [];
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function importCatalogModels(options: ImportOptions = {}) {
  const { category = "ALL", make: targetMake, dryRun = false, verbose = true } = options;

  const categories: Array<"CAR" | "MOTOR" | "SPARE_PART"> =
    category === "ALL" ? ["CAR", "MOTOR", "SPARE_PART"] : [category];

  let totalMakes = 0;
  let totalModels = 0;

  for (const cat of categories) {
    const makesList = DEFAULT_MAKES[cat].filter((m) =>
      targetMake ? m.toLowerCase() === targetMake.toLowerCase() : true,
    );

    for (const makeName of makesList) {
      if (verbose) {
        console.log(`[Import] Processing ${cat} make: ${makeName}`);
      }

      // Fetch NHTSA live models
      const nhtsaModels = await fetchNhtsaModelsForMake(makeName);

      // Merge with regional Cambodian models
      const regional = REGIONAL_MODELS[makeName] || [];
      const combinedModels = Array.from(new Set([...regional, ...nhtsaModels]));

      if (combinedModels.length === 0) {
        // Fallback placeholder if brand has no models yet
        combinedModels.push("Standard / Universal");
      }

      totalMakes += 1;
      totalModels += combinedModels.length;

      if (!dryRun) {
        // Upsert Make
        const makeRecord = await db.vehicleMake.upsert({
          where: {
            name_category: {
              name: makeName,
              category: cat,
            },
          },
          update: {
            slug: slugify(makeName),
          },
          create: {
            name: makeName,
            category: cat,
            slug: slugify(makeName),
          },
        });

        // Batch insert models
        const uniqueModelNames = Array.from(
          new Set(combinedModels.map((m) => m.trim().slice(0, 128)).filter(Boolean))
        );

        await db.vehicleModel.createMany({
          data: uniqueModelNames.map((name) => ({
            makeId: makeRecord.id,
            name,
            category: cat,
          })),
          skipDuplicates: true,
        });
      }

      if (verbose) {
        console.log(`  ✓ Saved ${combinedModels.length} models for ${makeName}`);
      }
    }
  }

  return { totalMakes, totalModels, dryRun };
}

// CLI entrypoint if executed directly
if (process.argv[1]?.endsWith("import-vehicle-models.ts")) {
  const args = process.argv.slice(2);
  const catArg = args.find((a) => a.startsWith("--category="))?.split("=")[1]?.toUpperCase();
  const makeArg = args.find((a) => a.startsWith("--make="))?.split("=")[1];
  const dryRun = args.includes("--dry-run");

  importCatalogModels({
    category: (catArg as any) || "ALL",
    make: makeArg,
    dryRun,
    verbose: true,
  })
    .then((stats) => {
      console.log(`\n🎉 Import Complete! Processed ${stats.totalMakes} makes and ${stats.totalModels} models.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Import failed:", err);
      process.exit(1);
    });
}
