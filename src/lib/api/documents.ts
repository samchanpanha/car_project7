// Vehicle document contracts (Task 17) — the five paper types a listing can
// carry, their lifecycle statuses and the shared Zod input schema used by both
// POST /api/vehicles and PATCH /api/vehicles/[id].
//
// Status lifecycle: sellers declare PROVIDED / MISSING; platform admins may
// additionally set VERIFIED / REJECTED (seller-sent verification values are
// clamped server-side so trust badges can't be self-awarded).

import { z } from "zod";

export const DOCUMENT_TYPES = [
  "REGISTRATION_BOOK",
  "IMPORT_DECLARATION",
  "SERVICE_RECORD",
  "INSPECTION_CERT",
  "INSURANCE",
] as const;

export const DOCUMENT_STATUSES = ["PROVIDED", "MISSING", "VERIFIED", "REJECTED"] as const;

/** Statuses a non-admin actor may set (verification is platform-admin-only). */
export const SELLER_DOC_STATUSES = ["PROVIDED", "MISSING"] as const;

/** One document row of a listing payload. `id` present = update existing row. */
export const documentInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  type: z.enum(DOCUMENT_TYPES),
  status: z.enum(DOCUMENT_STATUSES).default("PROVIDED"),
  notes: z.string().max(300).optional().nullable(),
  fileUrl: z.string().min(1).max(300).optional().nullable(),
});

export type DocumentInput = z.infer<typeof documentInputSchema>;

/** Full desired document list — server diffs it against the stored rows. */
export const documentsInputSchema = z.array(documentInputSchema).max(30);

/**
 * Status a non-admin may actually write: PROVIDED / MISSING pass through;
 * VERIFIED / REJECTED sent by sellers are clamped to PROVIDED (new rows) or
 * preserved from the stored row (existing rows — handled by the PATCH route).
 */
export function isSellerWritableStatus(status: string): boolean {
  return status === "PROVIDED" || status === "MISSING";
}
