/**
 * `/browse` metadata rules — pure functions so they stay unit-testable.
 *
 * Indexing policy:
 *  - a clean `/browse`, or one single facet (make/category), is indexable and
 *    self-canonical;
 *  - keyword searches (`q`) and arbitrary multi-filter combinations are
 *    `noindex, follow` — they're synthesised views, not landing pages, and
 *    would otherwise fill the index with near-duplicates.
 */

import { titleCase } from "./format";

/** Filter keys that create a distinct browse view. */
const FACET_KEYS = [
  "make",
  "bodyType",
  "category",
  "partCategory",
  "partTarget",
  "fuel",
  "transmission",
  "drivetrain",
  "condition",
  "city",
  "priceMin",
  "priceMax",
  "yearMin",
  "yearMax",
  "mileageMin",
  "mileageMax",
  "sellerType",
  "sellerVerified",
  "featured",
  "hasReport",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  CAR: "Cars",
  MOTOR: "Motorbikes & Scooters",
  SPARE_PART: "Car & Motorbike Spare Parts",
};

export interface BrowseSeo {
  title: string;
  description: string;
  /** Path + query for `<link rel="canonical">`. */
  canonical: string;
  indexable: boolean;
}

/** Which facets are actually present (non-empty). */
export function activeFacets(query: URLSearchParams): string[] {
  return FACET_KEYS.filter((key) => {
    const value = query.get(key);
    return Boolean(value && value.trim() && value !== "ALL");
  });
}

export function browseSeo(query: URLSearchParams): BrowseSeo {
  const q = query.get("q")?.trim() ?? "";
  const make = query.get("make")?.trim() ?? "";
  const rawCategory = query.get("category")?.trim() ?? "";
  const category = rawCategory === "ALL" ? "" : rawCategory;
  const facets = activeFacets(query);

  let title: string;
  let description: string;

  if (q) {
    title = `Search results for “${q}”`;
    description = `Cars, motorbikes and spare parts matching “${q}” on KhLan — Cambodia's trusted marketplace with verified sellers and AI vehicle reports.`;
  } else if (make) {
    title = `${titleCase(make)} for Sale in Cambodia`;
    description = `Browse ${titleCase(make)} cars, motorbikes and parts for sale in Cambodia. Compare prices, mileage and verified AI vehicle reports on KhLan.`;
  } else if (category) {
    const label = CATEGORY_LABELS[category] ?? "Vehicles";
    title = `${label} for Sale in Cambodia`;
    description = `Browse ${label.toLowerCase()} for sale in Cambodia — verified sellers, transparent pricing and evidence-based AI vehicle reports. Khmer & English.`;
  } else {
    title = "Browse Cars, Motorbikes & Spare Parts in Cambodia";
    description =
      "Search thousands of cars, motorbikes and spare parts for sale across Cambodia. Filter by make, price, year and city — verified sellers and AI vehicle reports on KhLan.";
  }

  // Canonical keeps only the "landing page" facet, never the ad-hoc filters.
  const canonicalParams = new URLSearchParams();
  if (make) canonicalParams.set("make", make);
  else if (category) canonicalParams.set("category", category);
  const canonicalQuery = canonicalParams.toString();
  const canonical = canonicalQuery ? `/browse?${canonicalQuery}` : "/browse";

  const indexable = !q && facets.length <= 1;

  return { title, description, canonical, indexable };
}
