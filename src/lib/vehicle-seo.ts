/**
 * Listing metadata + structured data. Pure and server-safe so both the route
 * files and the unit tests share one source of truth.
 */

import type { VehicleDetailWithFilesDTO } from "./listing-types";
import { absoluteUrl, SITE_NAME, vehicleUrl } from "./seo";
import { formatUsd } from "./format";

const TRANSMISSION: Record<string, string> = {
  AUTOMATIC: "Automatic",
  MANUAL: "Manual",
};

const FUEL: Record<string, string> = {
  PETROL: "Petrol",
  DIESEL: "Diesel",
  HYBRID: "Hybrid",
  ELECTRIC: "Electric",
};

const CONDITION: Record<string, string> = {
  LIKE_NEW: "Like new",
  NEW: "New",
  USED: "Used",
};

const BODY_TYPE: Record<string, string> = {
  SUV: "SUV",
  SEDAN: "Sedan",
  PICKUP: "Pickup",
  VAN: "Van",
  HATCHBACK: "Hatchback",
  COUPE: "Coupe",
  SCOOTER: "Scooter",
  CUB: "Cub",
  SPORT: "Sport bike",
  CRUISER: "Cruiser",
  DIRT: "Dirt bike",
  ELECTRIC: "Electric",
  OTHER: "Other",
};

export interface VehicleSeo {
  title: string;
  description: string;
  /** Human price, or `null` when the seller masked it. */
  price: string | null;
  /** Best available image, absolute. */
  image: string;
  indexable: boolean;
}

export function vehicleName(v: VehicleDetailWithFilesDTO): string {
  const variant = v.variant?.trim() ? ` ${v.variant.trim()}` : "";
  if (v.listingCategory === "SPARE_PART") {
    return `${v.make} ${v.model}`.trim();
  }
  return `${v.year} ${v.make} ${v.model}${variant}`.trim();
}

export function vehicleSeo(v: VehicleDetailWithFilesDTO): VehicleSeo {
  const name = vehicleName(v);
  const price = v.priceMasked ? null : formatUsd(v.priceUsd);
  const city = v.city?.trim();
  const where = city ? ` in ${city}` : " in Cambodia";

  const title = `${name} for Sale${where}${price ? ` — ${price}` : ""}`;

  const facts = [
    v.mileageKm ? `${v.mileageKm.toLocaleString("en-US")} km` : null,
    CONDITION[v.condition ?? ""] ?? null,
    TRANSMISSION[v.transmission ?? ""] ?? null,
    FUEL[v.fuel ?? ""] ?? null,
    BODY_TYPE[v.bodyType ?? ""] ?? null,
  ].filter(Boolean) as string[];

  const description =
    `${name}${price ? ` — ${price}` : ""}, ${facts.join(" · ")}. ` +
    `Verified listing on ${SITE_NAME} with photo check and AI vehicle history report. ` +
    `Contact the seller directly in Khmer or English.`;

  const image = v.images?.[0] ? absoluteUrl(v.images[0]) : absoluteUrl("/og/khlan-cover.png");

  // Sold or archived listings stay reachable but leave the index.
  const indexable = v.status === "PUBLISHED";

  return { title, description, price, image, indexable };
}

/** schema.org node for the listing itself. */
function productNode(v: VehicleDetailWithFilesDTO, url: string, price: string | null) {
  const schemaType =
    v.listingCategory === "CAR"
      ? "Car"
      : v.listingCategory === "MOTOR"
        ? "Motorcycle"
        : "Product";

  const seller = v.sellerFull ?? v.seller ?? null;
  const sellerNode = seller
    ? {
        "@type": seller.type === "DEALER" ? "AutoDealer" : "Person",
        name: seller.shopName || seller.name,
        url: absoluteUrl(`/sellers/${encodeURIComponent(seller.id)}`),
      }
    : undefined;

  return {
    "@type": schemaType,
    "@id": `${url}#listing`,
    name: vehicleName(v),
    description: v.description?.trim() || vehicleSeo(v).description,
    url,
    image: (v.images ?? []).slice(0, 6).map((src) => absoluteUrl(src)),
    brand: v.make ? { "@type": "Brand", name: v.make } : undefined,
    model: v.model || undefined,
    vehicleModelDate: v.year ? String(v.year) : undefined,
    bodyType: BODY_TYPE[v.bodyType ?? ""] ?? v.bodyType ?? undefined,
    vehicleTransmission: TRANSMISSION[v.transmission ?? ""] ?? v.transmission ?? undefined,
    fuelType: FUEL[v.fuel ?? ""] ?? v.fuel ?? undefined,
    vehicleEngine:
      v.engineCc != null
        ? {
            "@type": "EngineSpecification",
            engineDisplacement: {
              "@type": "QuantitativeValue",
              value: v.engineCc,
              unitCode: "CMQ",
            },
          }
        : undefined,
    mileageFromOdometer:
      v.mileageKm != null
        ? { "@type": "QuantitativeValue", value: v.mileageKm, unitCode: "KMT" }
        : undefined,
    itemCondition:
      v.condition === "LIKE_NEW" || v.condition === "NEW"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
    offers: price
      ? {
          "@type": "Offer",
          price: String(v.priceUsd),
          priceCurrency: "USD",
          url,
          availability:
            v.status === "SOLD"
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          areaServed: v.city || "Cambodia",
          seller: sellerNode,
        }
      : undefined,
    additionalProperty: [
      { "@type": "PropertyValue", name: "City", value: v.city || "Cambodia" },
      ...(v.year
        ? [{ "@type": "PropertyValue" as const, name: "Year", value: String(v.year) }]
        : []),
    ],
  };
}

/**
 * JSON-LD payload. Serialised as a string with `<` escaped so listing text
 * (seller descriptions are user input) can never break out of the script tag.
 */
export function vehicleJsonLd(v: VehicleDetailWithFilesDTO, url = vehicleUrl(v.id)): string {
  const { price } = vehicleSeo(v);

  const graph = [
    productNode(v, url, price),
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
        {
          "@type": "ListItem",
          position: 2,
          name: "Browse listings",
          item: absoluteUrl("/browse"),
        },
        { "@type": "ListItem", position: 3, name: vehicleName(v), item: url },
      ],
    },
  ];

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c"
  );
}
