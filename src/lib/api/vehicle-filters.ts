import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { SortOption, VehiclesResponseDTO } from "@/lib/types";
import type { PagedVehiclesResponseDTO } from "@/lib/listing-types";

export const ALLOWED_FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"] as const;
export const ALLOWED_TRANSMISSIONS = ["AUTOMATIC", "MANUAL"] as const;
export const ALLOWED_DRIVETRAINS = ["FWD", "RWD", "AWD"] as const;
export const ALLOWED_BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "HATCHBACK", "VAN", "COUPE"] as const;
export const ALLOWED_CONDITIONS = ["LIKE_NEW", "USED"] as const;
export const ALLOWED_VEHICLE_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "SOLD",
  "ARCHIVED",
] as const;
export const ALLOWED_SORTS: SortOption[] = [
  "newest",
  "price_asc",
  "price_desc",
  "year_desc",
  "mileage_asc",
  "discount_desc",
];

function num(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a comma-separated param into allowed enum values (invalid tokens ignored). */
function multi(
  value: string | null | undefined,
  allowed: readonly string[],
): string[] | undefined {
  if (!value) return undefined;
  const tokens = value
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => allowed.includes(t));
  return tokens.length > 0 ? tokens : undefined;
}

function rangeFilter(min: number | undefined, max: number | undefined) {
  if (min == null && max == null) return undefined;
  return { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) };
}

/**
 * Build the Prisma where clause for vehicle list queries.
 * Used by GET /api/vehicles and saved searches.
 */
export function buildVehicleWhere(sp: URLSearchParams): Prisma.VehicleWhereInput {
  const statusParam = sp.get("status");
  const where: Prisma.VehicleWhereInput = {
    status: statusParam && statusParam !== "ALL" ? statusParam : "PUBLISHED",
  };

  const make = sp.get("make") || undefined;
  if (make && make !== "all" && make !== "ALL") where.make = make;

  const model = sp.get("model") || undefined;
  if (model && model !== "all" && model !== "ALL") where.model = model;

  const city = sp.get("city") || undefined;
  if (city && city !== "all" && city !== "ALL") where.city = city;

  const locationPort = sp.get("locationPort") || undefined;
  if (locationPort && locationPort !== "all" && locationPort !== "ALL") {
    (where as any).locationPort = locationPort;
  }

  const steering = sp.get("steering") || undefined;
  if (steering && steering !== "ALL") {
    (where as any).steering = steering.toUpperCase();
  }

  const chassisNo = sp.get("chassisNo") || undefined;
  if (chassisNo) {
    (where as any).chassisNo = { contains: chassisNo, mode: "insensitive" };
  }

  const stockNo = sp.get("stockNo") || undefined;
  if (stockNo) {
    (where as any).stockNo = { contains: stockNo, mode: "insensitive" };
  }

  const seats = num(sp.get("seats"));
  if (seats != null) {
    (where as any).seats = seats;
  }

  const doors = num(sp.get("doors"));
  if (doors != null) {
    (where as any).doors = doors;
  }

  const variant = sp.get("variant") || sp.get("grade") || undefined;
  if (variant) {
    where.variant = { contains: variant, mode: "insensitive" };
  }

  const bodyTypes = multi(sp.get("bodyType"), ALLOWED_BODY_TYPES);
  if (bodyTypes) where.bodyType = { in: bodyTypes };

  const fuels = multi(sp.get("fuel"), ALLOWED_FUELS);
  if (fuels) where.fuel = { in: fuels };

  const transmissions = multi(sp.get("transmission"), ALLOWED_TRANSMISSIONS);
  if (transmissions) where.transmission = { in: transmissions };

  const drivetrains = multi(sp.get("drivetrain"), ALLOWED_DRIVETRAINS);
  if (drivetrains) where.drivetrain = { in: drivetrains };

  const conditions = multi(sp.get("condition"), ALLOWED_CONDITIONS);
  if (conditions) where.condition = { in: conditions };

  const priceRange = rangeFilter(num(sp.get("priceMin")), num(sp.get("priceMax")));
  if (priceRange) where.priceUsd = priceRange;

  // Engine cc range (motor & car)
  const engineMin = num(sp.get("engineMin") || sp.get("engineCcMin"));
  const engineMax = num(sp.get("engineMax") || sp.get("engineCcMax"));
  const engineRange = rangeFilter(engineMin, engineMax);
  if (engineRange) where.engineCc = engineRange;

  const yearRange = rangeFilter(num(sp.get("yearMin")), num(sp.get("yearMax")));
  if (yearRange) where.year = yearRange;

  const mileageRange = rangeFilter(num(sp.get("mileageMin")), num(sp.get("mileageMax")));
  if (mileageRange) where.mileageKm = mileageRange;

  // Motor-specific attributes
  const motorType = sp.get("motorType");
  if (motorType && motorType !== "ALL") {
    (where as any).motorType = motorType.toUpperCase();
  }

  const hasAbsParam = sp.get("hasAbs");
  if (hasAbsParam === "true" || hasAbsParam === "1") {
    (where as any).hasAbs = true;
  } else if (hasAbsParam === "false" || hasAbsParam === "0") {
    (where as any).hasAbs = false;
  }

  const startType = sp.get("startType");
  if (startType && startType !== "ALL") {
    (where as any).startType = startType.toUpperCase();
  }

  // Spare-part specific attributes
  const partNumber = sp.get("partNumber");
  if (partNumber) {
    (where as any).partNumber = { contains: partNumber, mode: "insensitive" };
  }

  const oemBrand = sp.get("oemBrand") || sp.get("brand");
  if (oemBrand && oemBrand !== "all" && oemBrand !== "ALL") {
    (where as any).oemBrand = oemBrand;
  }

  const isOemParam = sp.get("isOem");
  if (isOemParam === "true" || isOemParam === "1") {
    (where as any).isOem = true;
  } else if (isOemParam === "false" || isOemParam === "0") {
    (where as any).isOem = false;
  }

  const position = sp.get("position");
  if (position && position !== "ALL") {
    (where as any).position = position.toUpperCase();
  }

  const compatibleMake = sp.get("compatibleMake");
  if (compatibleMake && compatibleMake !== "ALL") {
    (where as any).compatibleMake = compatibleMake;
  }

  const compatibleModel = sp.get("compatibleModel");
  if (compatibleModel && compatibleModel !== "ALL") {
    (where as any).compatibleModel = compatibleModel;
  }

  const compatibleYear = num(sp.get("compatibleYear"));
  if (compatibleYear != null) {
    (where as any).AND = [
      ...((where as any).AND || []),
      {
        OR: [
          { compatibleYearMin: null, compatibleYearMax: null },
          {
            compatibleYearMin: { lte: compatibleYear },
            compatibleYearMax: { gte: compatibleYear },
          },
        ],
      },
    ];
  }

  // Price type filter (e.g. HOT_PRICE, DISCOUNT_PRICE)
  const priceType = sp.get("priceType");
  if (priceType && priceType !== "ALL") {
    where.itemPrices = {
      some: {
        active: true,
        priceType: {
          code: priceType.toUpperCase(),
          active: true,
        },
      },
    };
  }

  const sellerType = sp.get("sellerType") || undefined;
  const sellerVerified = sp.get("sellerVerified") === "true";
  const sellerId = sp.get("sellerId") || undefined;
  const dealerId = sp.get("dealerId") || undefined;

  if (sellerId) {
    where.sellerId = sellerId;
  } else if (dealerId) {
    where.OR = [{ tenantId: dealerId }, { sellerId: dealerId }];
  }

  if (sellerType === "PRIVATE" || sellerType === "DEALER" || sellerVerified) {
    const profile: Prisma.SellerProfileWhereInput = {};
    if (sellerType === "PRIVATE" || sellerType === "DEALER") profile.type = sellerType;
    if (sellerVerified) profile.verified = true;
    where.seller = { sellerProfile: profile };
  }

  if (sp.get("featured") === "true") where.featured = true;
  if (sp.get("hasReport") === "true") where.reports = { some: { status: "COMPLETE" } };

  const category = sp.get("category") || sp.get("listingCategory");
  if (category && category.trim().toUpperCase() !== "ALL") {
    (where as any).listingCategory = category.trim().toUpperCase();
  }

  const partCategory = sp.get("partCategory");
  if (partCategory && partCategory.trim().toUpperCase() !== "ALL") {
    (where as any).partCategory = partCategory.trim().toUpperCase();
  }

  const partTarget = sp.get("partTarget");
  if (partTarget && partTarget.trim().toUpperCase() !== "ALL") {
    (where as any).partTarget = partTarget.trim().toUpperCase();
  }

  const partCondition = sp.get("partCondition") || (category === "SPARE_PART" ? sp.get("condition") : null);
  if (partCondition && partCondition.trim().toUpperCase() !== "ALL" && partCondition.trim().toUpperCase() !== "ANY") {
    (where as any).partCondition = partCondition.trim().toUpperCase();
  }

  return where;
}

/**
 * Shared buyer-flow vehicle listing: DB filters → case-insensitive q → sort →
 * page pagination. Accepts a 1-based "page" param (preferred) and keeps the
 * legacy 0-based "cursor" for backward compatibility (saved searches).
 * Returns the canonical VehiclesResponseDTO extended with page/pageSize/
 * pageCount so clients can render numbered pagination.
 */
export async function listVehicles(sp: URLSearchParams): Promise<PagedVehiclesResponseDTO> {
  const where = buildVehicleWhere(sp);
  const pageSize = Math.min(Math.max(Math.trunc(num(sp.get("limit")) ?? 12), 1), 48);
  const q = sp.get("q")?.trim().toLowerCase() || undefined;
  const onSaleOnly = sp.get("onSale") === "true" || sp.get("onSale") === "1";
  const priceMin = num(sp.get("priceMin"));
  const priceMax = num(sp.get("priceMax"));
  const featuresFilter = sp.get("features")
    ? sp.get("features")!.split(",").map((f) => f.trim().toLowerCase()).filter(Boolean)
    : [];

  const sortParam = sp.get("sort") || "newest";
  const sort: SortOption = ALLOWED_SORTS.includes(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "newest";

  const matches = await db.vehicle.findMany({
    where,
    include: vehicleCardInclude,
    orderBy: { createdAt: "desc" },
  });

  // Map to card DTOs with pricing resolution
  let cards = matches.map(toCardDTO);

  // Filter by q (case-insensitive across keywords, specs, and identifiers)
  if (q) {
    cards = cards.filter((v) => {
      const text = `${v.make} ${v.model} ${v.variant ?? ""} ${v.city ?? ""} ${v.year} ${v.partNumber ?? ""} ${v.compatibleModels ?? ""} ${v.partCategory ?? ""} ${v.chassisNo ?? ""} ${v.stockNo ?? ""} ${v.seller?.name ?? ""} ${v.seller?.shopName ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }

  // Effective price range filtering
  if (priceMin != null) {
    cards = cards.filter((v) => (v.effectivePriceUsd ?? v.priceUsd) >= priceMin);
  }
  if (priceMax != null) {
    cards = cards.filter((v) => (v.effectivePriceUsd ?? v.priceUsd) <= priceMax);
  }

  // On-sale promotional filter
  if (onSaleOnly) {
    cards = cards.filter((v) => Boolean(v.isOnSale));
  }

  // Features filter
  if (featuresFilter.length > 0) {
    cards = cards.filter((v) => {
      const vFeatures = (v.features || []).map((f) => f.toLowerCase());
      return featuresFilter.every((req) => vFeatures.includes(req));
    });
  }

  // Sorting
  switch (sort) {
    case "price_asc":
      cards.sort((a, b) => (a.effectivePriceUsd ?? a.priceUsd) - (b.effectivePriceUsd ?? b.priceUsd));
      break;
    case "price_desc":
      cards.sort((a, b) => (b.effectivePriceUsd ?? b.priceUsd) - (a.effectivePriceUsd ?? a.priceUsd));
      break;
    case "discount_desc":
      cards.sort((a, b) => (b.discountUsd ?? 0) - (a.discountUsd ?? 0));
      break;
    case "year_desc":
      cards.sort((a, b) => b.year - a.year);
      break;
    case "mileage_asc":
      cards.sort((a, b) => a.mileageKm - b.mileageKm);
      break;
    default:
      cards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const total = cards.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // 1-based "page" wins; legacy "cursor" is a 0-based page index.
  const pageParam = sp.get("page");
  let page: number;
  if (pageParam != null && pageParam.trim() !== "") {
    page = Math.max(1, Math.trunc(num(pageParam) ?? 1));
  } else {
    page = Math.max(0, Math.trunc(num(sp.get("cursor")) ?? 0)) + 1;
  }
  const current = Math.min(page, pageCount);

  const start = (current - 1) * pageSize;
  const pageItems = cards.slice(start, start + pageSize);
  const nextCursor = start + pageSize < total ? String(current) : null;

  const response: VehiclesResponseDTO = {
    items: pageItems,
    nextCursor,
    total,
  };
  return { ...response, page: current, pageSize, pageCount };
}

/** Zod schema for a stored saved-search query (flat string|number record). */
export const savedSearchQuerySchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

/** Turn a stored saved-search query into search params understood by listVehicles. */
export function queryToSearchParams(query: Record<string, string | number>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null) sp.set(key, String(value));
  }
  return sp;
}
