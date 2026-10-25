// Listing stock management DTOs (Task 16) — inventory editing contracts shared
// by the dealer inventory tab, the sell view "your listings" section and the
// /api/vehicles endpoints. Additive to lib/types.ts (which stays untouched).

import type { VehicleDetailDTO, VehicleStatus, VehiclesResponseDTO } from "./types";

/** Row of GET /api/vehicles/mine — the signed-in user's own (non-tenant) listings. */
export interface MyListingRowDTO {
  id: string;
  listingCategory?: string;
  partCategory?: string | null;
  partTarget?: string | null;
  partCondition?: string | null;
  compatibleModels?: string | null;
  partNumber?: string | null;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  priceUsd: number;
  priceMasked?: boolean;
  mileageKm: number;
  status: VehicleStatus;
  featured: boolean;
  views: number;
  createdAt: string;
  images: string[]; // urls sorted by sortOrder (first = cover)
}

/** Vehicle document row as served by the detail endpoints — adds the row id
 * and the uploaded file URL on top of the public VehicleDocumentDTO. */
export interface VehicleDocumentRowDTO {
  id: string;
  type: string; // REGISTRATION_BOOK | IMPORT_DECLARATION | SERVICE_RECORD | INSPECTION_CERT | INSURANCE
  status: string; // PROVIDED | MISSING | VERIFIED | REJECTED
  notes: string | null;
  fileUrl: string | null; // /api/uploads/<file> when a file was attached
}

/** VehicleDetailDTO + manage flag: true when the caller may edit this listing. */
export interface ManageableVehicleDetailDTO extends VehicleDetailDTO {
  manage: boolean;
  // Narrowed: the detail endpoints return document rows with id + fileUrl.
  documents: VehicleDocumentRowDTO[];
  /** True when the caller may set VERIFIED/REJECTED statuses (platform admin). */
  canVerifyDocuments?: boolean;
}

/** Public detail payload — document rows carry the uploaded file URL so
 * buyers can open the actual paper (trust signal). */
export interface VehicleDetailWithFilesDTO extends VehicleDetailDTO {
  documents: VehicleDocumentRowDTO[];
}

/** VehiclesResponseDTO + explicit page fields for real numbered pagination.
 * Additive — the legacy { items, nextCursor, total } shape stays intact, so
 * saved-search runners and other consumers keep working unchanged. */
export interface PagedVehiclesResponseDTO extends VehiclesResponseDTO {
  /** 1-based current page (server clamps it into [1, pageCount]). */
  page: number;
  /** Rows per page (the "limit" param). */
  pageSize: number;
  /** Total number of pages (≥ 1, even for empty result sets). */
  pageCount: number;
}
