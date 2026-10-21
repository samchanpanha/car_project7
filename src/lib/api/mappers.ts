import type {
  SellerSummaryDTO,
  VehicleCardDTO,
  VehicleDetailDTO,
  VehicleDocumentDTO,
} from "@/lib/types";
import type { Prisma, SellerProfile, User } from "@prisma/client";

/** Vehicle row with the relations needed to build a VehicleCardDTO. */
export type VehicleWithCardRelations = Prisma.VehicleGetPayload<{
  include: {
    images: true;
    documents: true;
    seller: { include: { sellerProfile: true } };
    reports: { select: { id: true; status: true } };
  };
}>;

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
};

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
  };
}

export function toDocumentDTOs(
  documents: { type: string; status: string; notes: string | null }[],
): VehicleDocumentDTO[] {
  return documents.map((d) => ({ type: d.type, status: d.status, notes: d.notes }));
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
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant ?? null,
    year: vehicle.year,
    priceUsd: vehicle.priceUsd,
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
    createdAt: vehicle.createdAt.toISOString(),
    seller: toSellerSummary(vehicle.seller),
    images,
    trust: { docsProvided, reportAvailable },
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
    vinLast6: vehicle.vinLast6 ?? null,
    plateNo: vehicle.plateNo ?? null,
    ownershipCount: vehicle.ownershipCount ?? null,
    accidentDeclared: vehicle.accidentDeclared,
    importOrigin: vehicle.importOrigin ?? null,
    description: vehicle.description ?? null,
    descriptionKm: vehicle.descriptionKm ?? null,
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
} satisfies Prisma.VehicleInclude;
