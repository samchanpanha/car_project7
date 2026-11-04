/**
 * Server-side helpers for talking to the Spring Boot backend.
 *
 * The browser reaches the API through the Next.js `/api/*` rewrite, but server
 * components, `generateMetadata` and `app/sitemap.ts` have no origin to resolve
 * a relative URL against — they call the backend directly.
 */

import type { VehicleCardDTO } from "./types";
import type { VehicleDetailWithFilesDTO } from "./listing-types";
import { BACKEND_URL } from "./seo";

export interface BackendPagedVehicles {
  items?: VehicleCardDTO[];
  vehicles?: VehicleCardDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Public detail payload returned by `GET /api/vehicles/{id}`. */
export interface VehicleDetailPayload {
  vehicle: VehicleDetailWithFilesDTO;
  similar: VehicleCardDTO[];
}

export type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; network: boolean };

/** GET a backend endpoint, never throws. `status: 0` means the request itself
 *  failed (backend down / DNS / timeout) rather than an HTTP error. */
export async function backendFetch<T>(path: string, revalidate = 600): Promise<BackendResult<T>> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) return { ok: false, status: res.status, network: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, network: true };
  }
}

export async function fetchVehicle(id: string): Promise<BackendResult<VehicleDetailPayload>> {
  try {
    const { getVehicleDetailPayload } = await import("@/lib/api/vehicle-detail");
    const payload = await getVehicleDetailPayload(id);
    if (payload) {
      return { ok: true, data: payload };
    }
  } catch {
    // fallback to backendFetch
  }
  return backendFetch<VehicleDetailPayload>(`/api/vehicles/${encodeURIComponent(id)}`, 600);
}

/** Walk the published catalogue for the sitemap. Stops early on any failure so
 *  a backend outage degrades to "partial sitemap" instead of a 500. */
export async function fetchVehiclePages(
  maxPages = 10,
  pageSize = 100
): Promise<{ vehicles: VehicleCardDTO[]; complete: boolean }> {
  const collect = (page: BackendPagedVehicles) => page.items ?? page.vehicles ?? [];

  const first = await backendFetch<BackendPagedVehicles>(
    `/api/vehicles?status=PUBLISHED&sort=newest&page=1&limit=${pageSize}`,
    3600
  );
  if (!first.ok) return { vehicles: [], complete: false };

  const vehicles = [...collect(first.data)];
  const pageCount = Math.min(first.data.pageCount ?? 1, maxPages);

  for (let page = 2; page <= pageCount; page += 1) {
    const res = await backendFetch<BackendPagedVehicles>(
      `/api/vehicles?status=PUBLISHED&sort=newest&page=${page}&limit=${pageSize}`,
      3600
    );
    if (!res.ok) return { vehicles, complete: false };
    vehicles.push(...collect(res.data));
  }

  return { vehicles, complete: pageCount <= maxPages };
}
