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
 * Build the Prisma where clause for the PUBLIC vehicle list (always PUBLISHED
 * only). Used by GET /api/vehicles and by saved-search runs so both apply
 * exactly the same filter semantics.
 */
export function buildVehicleWhere(sp: URLSearchParams): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { status: "PUBLISHED" };

  const make = sp.get("make") || undefined;
  if (make) where.make = make;
  const city = sp.get("city") || undefined;
  if (city) where.city = city;

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

  const yearRange = rangeFilter(num(sp.get("yearMin")), num(sp.get("yearMax")));
  if (yearRange) where.year = yearRange;

  const mileageRange = rangeFilter(num(sp.get("mileageMin")), num(sp.get("mileageMax")));
  if (mileageRange) where.mileageKm = mileageRange;

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
  const sortParam = sp.get("sort") || "newest";
  const sort: SortOption = ALLOWED_SORTS.includes(sortParam as SortOption)
    ? (sortParam as SortOption)
    : "newest";

  const matches = await db.vehicle.findMany({
    where,
    include: vehicleCardInclude,
    orderBy: { createdAt: "desc" },
  });

  // q needs case-insensitive matching, which SQLite + Prisma does not support.
  const filtered = q
    ? matches.filter((v) => {
        const text = `${v.make} ${v.model} ${v.variant ?? ""} ${v.city ?? ""} ${v.year} ${v.seller?.name ?? ""} ${v.seller?.sellerProfile?.shopName ?? ""}`.toLowerCase();
        return text.includes(q);
      })
    : matches;

  switch (sort) {
    case "price_asc":
      filtered.sort((a, b) => a.priceUsd - b.priceUsd);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.priceUsd - a.priceUsd);
      break;
    case "year_desc":
      filtered.sort((a, b) => b.year - a.year);
      break;
    case "mileage_asc":
      filtered.sort((a, b) => a.mileageKm - b.mileageKm);
      break;
    default:
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // 1-based "page" wins; legacy "cursor" is a 0-based page index. Requests
  // beyond the last page clamp onto it (never a blank page from a stale link).
  const pageParam = sp.get("page");
  let page: number;
  if (pageParam != null && pageParam.trim() !== "") {
    page = Math.max(1, Math.trunc(num(pageParam) ?? 1));
  } else {
    page = Math.max(0, Math.trunc(num(sp.get("cursor")) ?? 0)) + 1;
  }
  const current = Math.min(page, pageCount);

  const start = (current - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const nextCursor = start + pageSize < total ? String(current) : null;

  const response: VehiclesResponseDTO = {
    items: pageItems.map(toCardDTO),
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
