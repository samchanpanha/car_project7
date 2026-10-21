// Listing stock management DTOs (Task 16) — inventory editing contracts shared
// by the dealer inventory tab, the sell view "your listings" section and the
// /api/vehicles endpoints. Additive to lib/types.ts (which stays untouched).

import type { VehicleDetailDTO, VehicleStatus } from "./types";

/** Row of GET /api/vehicles/mine — the signed-in user's own (non-tenant) listings. */
export interface MyListingRowDTO {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  year: number;
  priceUsd: number;
  mileageKm: number;
  status: VehicleStatus;
  featured: boolean;
  views: number;
  createdAt: string;
  images: string[]; // urls sorted by sortOrder (first = cover)
}

/** VehicleDetailDTO + manage flag: true when the caller may edit this listing. */
export interface ManageableVehicleDetailDTO extends VehicleDetailDTO {
  manage: boolean;
}
