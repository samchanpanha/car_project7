import type {
  SellerSummaryDTO,
  SellerTelegramLinksDTO,
  VehicleCardDTO,
  VehicleDetailDTO,
} from "@/lib/types";
import type { VehicleDocumentRowDTO } from "@/lib/listing-types";
import type { Prisma, SellerProfile, User } from "@prisma/client";
import { resolveEffectivePrice } from "@/lib/pricing/price-engine";

/** Vehicle row with the relations needed to build a VehicleCardDTO. */
export type VehicleWithCardRelations = Prisma.VehicleGetPayload<{
  include: {
    images: true;
    documents: true;
    seller: { include: { sellerProfile: true } };
    reports: { select: { id: true; status: true } };
    itemPrices?: { include: { priceType: true } };
  };
}> & {
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    city?: string | null;
    district?: string | null;
    isMain?: boolean;
  } | null;
};

export type UserWithSellerProfile = User & { sellerProfile: SellerProfile | null };

/** Seller summary + full profile fields (superset assignable to both detail & seller-page DTOs). */
export type SellerFullDTO = SellerSummaryDTO & {
  bio?: string | null;
  bioKm?: string | null;
  memberSince: string;
  phone?: string | null;
  telegram?: string | null;
  responseRate: number;
  logoUrl?: string | null;
} & SellerTelegramLinksDTO;

/** Map a User (+ optional SellerProfile) to the shared SellerSummaryDTO. */
export function toSellerSummary(user: UserWithSellerProfile): SellerSummaryDTO {
  const p = user.sellerProfile;
  return {
    id: user.id,
    name: user.name,
    shopName: p?.shopName ?? null,
    type: (p?.type === "DEALER" ? "DEALER" : "PRIVATE") as SellerSummaryDTO["type"],
    verified: p?.verified ?? false,
    verification: (p?.verification ?? "UNVERIFIED") as SellerSummaryDTO["verification"],
    ratingAvg: p?.ratingAvg ?? 0,
    ratingCount: p?.ratingCount ?? 0,
    city: p?.city ?? "Phnom Penh",
  };
}

export function toSellerFullDTO(user: UserWithSellerProfile): SellerFullDTO {
  const summary = toSellerSummary(user);
  const p = user.sellerProfile;
  return {
    ...summary,
    bio: p?.bio ?? null,
    bioKm: p?.bioKm ?? null,
    memberSince: (p?.memberSince ?? user.createdAt).toISOString(),
    phone: p?.phone ?? null,
    telegram: p?.telegram ?? null,
    responseRate: p?.responseRate ?? 0,
    logoUrl: p?.logoUrl ?? null,
    tgMiniAppUrl: p?.tgMiniAppUrl ?? null,
    tgChannelUrl: p?.tgChannelUrl ?? null,
    tgGroupUrl: p?.tgGroupUrl ?? null,
    inviteCode: p?.inviteCode ?? null,
  };
}

export function toDocumentDTOs(
  documents: { id: string; type: string; status: string; notes: string | null; fileUrl: string | null }[],
): VehicleDocumentRowDTO[] {
  return documents.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    notes: d.notes,
    fileUrl: d.fileUrl,
  }));
}

/** Base fields shared by card + detail DTOs. */
function baseCard(vehicle: VehicleWithCardRelations): VehicleCardDTO {
  const images = [...vehicle.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => i.url);
  const docsProvided = vehicle.documents.filter(
    (d) => d.status === "PROVIDED" || d.status === "VERIFIED",
  ).length;
  const reportAvailable = vehicle.reports.some((r) => r.status === "COMPLETE");

  // Calculate pricing resolution
  const pricing = resolveEffectivePrice({
    id: vehicle.id,
    priceUsd: vehicle.priceUsd,
    floorPriceUsd: (vehicle as any).floorPriceUsd ?? null,
    itemPrices: (vehicle as any).itemPrices ?? [],
  });

  // Safely parse features if stored as JSON string
  let parsedFeatures: string[] | null = null;
  const rawFeatures = (vehicle as any).features;
  if (Array.isArray(rawFeatures)) {
    parsedFeatures = rawFeatures;
  } else if (typeof rawFeatures === "string" && rawFeatures.trim()) {
    try {
      parsedFeatures = JSON.parse(rawFeatures);
    } catch {
      parsedFeatures = rawFeatures.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return {
    id: vehicle.id,
    listingCategory: (vehicle as any).listingCategory ?? "CAR",
    partCategory: (vehicle as any).partCategory ?? null,
    partTarget: (vehicle as any).partTarget ?? null,
    partCondition: (vehicle as any).partCondition ?? null,
    compatibleModels: (vehicle as any).compatibleModels ?? null,
    partNumber: (vehicle as any).partNumber ?? null,
    engineCc: vehicle.engineCc ?? null,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant ?? null,
    year: vehicle.year,
    priceUsd: pricing.effectivePriceUsd,
    effectivePriceUsd: pricing.effectivePriceUsd,
    basePriceUsd: vehicle.priceUsd,
    isOnSale: pricing.isOnSale,
    activePriceType: pricing.activePriceType
      ? {
          code: pricing.activePriceType.code,
          label: pricing.activePriceType.label,
          badgeColor: pricing.activePriceType.badgeColor,
          mode: String(pricing.activePriceType.mode),
        }
      : null,
    discountUsd: pricing.discountUsd,
    discountPercent: pricing.discountPercent,
    savingsBadgeText: pricing.savingsBadgeText,
    floorPriceUsd: pricing.floorPriceUsd,
    floorEnforced: pricing.floorEnforced,
    doors: (vehicle as any).doors ?? null,
    steering: (vehicle as any).steering ?? "LEFT",
    chassisNo: (vehicle as any).chassisNo ?? null,
    stockNo: (vehicle as any).stockNo ?? null,
    locationPort: (vehicle as any).locationPort ?? null,
    features: parsedFeatures,
    motorType: (vehicle as any).motorType ?? null,
    hasAbs: Boolean((vehicle as any).hasAbs),
    startType: (vehicle as any).startType ?? null,
    oemBrand: (vehicle as any).oemBrand ?? null,
    isOem: (vehicle as any).isOem != null ? Boolean((vehicle as any).isOem) : true,
    position: (vehicle as any).position ?? null,
    compatibleYearMin: (vehicle as any).compatibleYearMin ?? null,
    compatibleYearMax: (vehicle as any).compatibleYearMax ?? null,
    compatibleMake: (vehicle as any).compatibleMake ?? null,
    compatibleModel: (vehicle as any).compatibleModel ?? null,
    priceMasked: Boolean((vehicle as any).priceMasked),
    mileageKm: vehicle.mileageKm,
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    bodyType: vehicle.bodyType,
    city: vehicle.city,
    district: vehicle.district ?? null,
    condition: vehicle.condition,
    status: vehicle.status as VehicleCardDTO["status"],
    featured: vehicle.featured,
    views: vehicle.views,
    createdAt: vehicle.createdAt instanceof Date ? vehicle.createdAt.toISOString() : String(vehicle.createdAt),
    seller: toSellerSummary(vehicle.seller),
    images,
    trust: { docsProvided, reportAvailable },
    branchId: vehicle.branchId ?? null,
    branchName: vehicle.branch?.name ?? null,
  };
}

/** Map a Vehicle (with card relations included) to the shared VehicleCardDTO. */
export function toCardDTO(vehicle: VehicleWithCardRelations): VehicleCardDTO {
  return baseCard(vehicle);
}

/** Map a Vehicle to VehicleDetailDTO (extra detail fields, documents, sellerFull). */
export function toDetailDTO(vehicle: VehicleWithCardRelations): VehicleDetailDTO {
  return {
    ...baseCard(vehicle),
    engineCc: vehicle.engineCc ?? null,
    drivetrain: vehicle.drivetrain ?? null,
    exteriorColor: vehicle.exteriorColor ?? null,
    seats: (vehicle as any).seats ?? null,
    interiorColor: (vehicle as any).interiorColor ?? null,
    fuelEconomy: (vehicle as any).fuelEconomy ?? null,
    vinLast6: vehicle.vinLast6 ?? null,
    plateNo: vehicle.plateNo ?? null,
    ownershipCount: vehicle.ownershipCount ?? null,
    accidentDeclared: vehicle.accidentDeclared,
    importOrigin: vehicle.importOrigin ?? null,
    description: vehicle.description ?? null,
    descriptionKm: vehicle.descriptionKm ?? null,
    branchAddress: vehicle.branch?.address ?? null,
    branchPhone: vehicle.branch?.phone ?? null,
    updatedAt: vehicle.updatedAt.toISOString(),
    documents: toDocumentDTOs(vehicle.documents),
    sellerFull: toSellerFullDTO(vehicle.seller),
    report: null,
  };
}

/** Include block used by every vehicle query so mapper output stays consistent. */
export const vehicleCardInclude = {
  images: true,
  documents: true,
  seller: { include: { sellerProfile: true } },
  reports: { select: { id: true, status: true } },
  branch: true,
  itemPrices: { include: { priceType: true } },
} as const;
