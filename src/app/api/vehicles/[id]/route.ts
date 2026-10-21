import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canWriteTenant, toErrorResponse } from "@/lib/api/guards";
import { documentsInputSchema, isSellerWritableStatus } from "@/lib/api/documents";
import { toCardDTO, toDetailDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { VehicleCardDTO } from "@/lib/types";
import type { DemoUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Vehicle fields needed for ownership checks (no relations). */
type VehicleOwnership = {
  id: string;
  sellerId: string;
  createdById: string | null;
  tenantId: string | null;
};

/**
 * True when `actor` may manage (edit info / manage images of) this listing:
 * platform admin, the display seller, the creating user, or a write-capable
 * member of the tenant that owns it.
 */
async function canManageVehicle(vehicle: VehicleOwnership, actor: DemoUser): Promise<boolean> {
  if (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") return true;
  if (vehicle.sellerId === actor.id) return true;
  if (vehicle.createdById && vehicle.createdById === actor.id) return true;
  if (vehicle.tenantId) {
    const membership = await db.tenantMember.findFirst({
      where: { userId: actor.id, tenantId: vehicle.tenantId, status: "ACTIVE" },
      select: { role: true },
    });
    if (membership && canWriteTenant(membership.role)) return true;
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vehicle = await db.vehicle.findUnique({
      where: { id },
      include: vehicleCardInclude,
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Managers (owner/tenant staff/admin) may open their own DRAFT/REJECTED
    // listings for editing — the public 404 behaviour only applies to visitors.
    const actor = await getCurrentUser();
    const manage = await canManageVehicle(vehicle, actor);
    if (!manage && (vehicle.status === "DRAFT" || vehicle.status === "REJECTED")) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Count the view for public visitors only (managers poll their own listing).
    if (!manage) {
      await db.vehicle.update({ where: { id }, data: { views: { increment: 1 } } });
    }

    const [latestReport, similarRows] = await Promise.all([
      db.vehicleHistoryReport.findFirst({
        where: { vehicleId: id, status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, overallConfidence: true },
      }),
      // Similar listings are a public-page concern; skip the extra query for managers.
      manage
        ? Promise.resolve([])
        : db.vehicle.findMany({
            where: {
              status: "PUBLISHED",
              id: { not: id },
              OR: [{ bodyType: vehicle.bodyType }, { make: vehicle.make }],
            },
            orderBy: { createdAt: "desc" },
            take: 4,
            include: vehicleCardInclude,
          }),
    ]);

    const detail = toDetailDTO(vehicle);
    detail.views = manage ? vehicle.views : vehicle.views + 1; // reflect the just-counted view
    detail.report = latestReport
      ? {
          id: latestReport.id,
          createdAt: latestReport.createdAt.toISOString(),
          overallConfidence: latestReport.overallConfidence,
        }
      : null;

    const similar: VehicleCardDTO[] = similarRows.map(toCardDTO);

    return NextResponse.json({
      vehicle: {
        ...detail,
        manage,
        // Only platform admins may set VERIFIED/REJECTED on documents — the
        // editor uses this to decide which status options to offer.
        ...(manage ? { canVerifyDocuments: actor.role === "ADMIN" || actor.role === "SUPER_ADMIN" } : {}),
      },
      similar,
    });
  } catch (err) {
    console.error("[api/vehicles/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load vehicle" }, { status: 500 });
  }
}

// ---------- PATCH — full listing edit (info + image management) ----------

const patchSchema = z
  .object({
    make: z.string().min(1).max(60),
    model: z.string().min(1).max(80),
    variant: z.string().max(80).optional().nullable(),
    year: z.number().int().min(1990).max(2026),
    priceUsd: z.number().positive(),
    mileageKm: z.number().int().min(0),
    transmission: z.enum(["AUTOMATIC", "MANUAL"]),
    fuel: z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]),
    engineCc: z.number().int().min(0).optional().nullable(),
    drivetrain: z.enum(["FWD", "RWD", "AWD", "4WD"]).optional().nullable(),
    bodyType: z.enum(["SUV", "SEDAN", "PICKUP", "HATCHBACK", "VAN", "COUPE"]),
    exteriorColor: z.string().max(40).optional().nullable(),
    city: z.string().min(1).max(60),
    district: z.string().max(60).optional().nullable(),
    condition: z.enum(["LIKE_NEW", "USED"]),
    accidentDeclared: z.enum(["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"]),
    ownershipCount: z.number().int().min(0).optional().nullable(),
    vinLast6: z.string().max(6).optional().nullable(),
    plateNo: z.string().max(20).optional().nullable(),
    importOrigin: z.enum(["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"]).optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
    descriptionKm: z.string().max(4000).optional().nullable(),
    status: z.enum(["DRAFT", "PUBLISHED", "SOLD", "ARCHIVED"]),
    // Full desired image list, in display order (first = cover). The server
    // replaces the stored rows with this list — covers add / remove / reorder
    // in one idempotent call. Unlimited photo count (sane abuse cap below).
    images: z.array(z.string().min(1).max(200_000)).max(500),
    // Full desired document list — rows with `id` are updated, rows without
    // `id` are created, stored rows missing from the list are deleted.
    documents: documentsInputSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const vehicle = await db.vehicle.findUnique({
      where: { id },
      select: { id: true, sellerId: true, createdById: true, tenantId: true, status: true, featured: true },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const actor = await getCurrentUser();
    if (!(await canManageVehicle(vehicle, actor))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = parsed.data;
    const changed: string[] = [];

    // Scalar fields — only touch the ones present in the payload.
    const scalar: Record<string, unknown> = {};
    const SCALAR_KEYS = [
      "make", "model", "variant", "year", "priceUsd", "mileageKm", "transmission", "fuel",
      "engineCc", "drivetrain", "bodyType", "exteriorColor", "city", "district", "condition",
      "accidentDeclared", "ownershipCount", "vinLast6", "plateNo", "importOrigin",
      "description", "descriptionKm", "status",
    ] as const;
    for (const key of SCALAR_KEYS) {
      if (data[key] !== undefined) {
        scalar[key] = data[key];
        changed.push(key);
      }
    }
    if (Object.keys(scalar).length > 0) {
      await db.vehicle.update({ where: { id }, data: scalar });
    }

    // Image management — replace with the desired ordered list.
    let imagesAdded = 0;
    let imagesRemoved = 0;
    if (data.images !== undefined) {
      const desired = Array.from(new Set(data.images.map((u) => u.trim()).filter(Boolean)));
      const current = await db.vehicleImage.findMany({
        where: { vehicleId: id },
        select: { url: true },
      });
      const currentUrls = new Set(current.map((i) => i.url));
      const desiredSet = new Set(desired);
      imagesAdded = desired.filter((u) => !currentUrls.has(u)).length;
      imagesRemoved = current.filter((i) => !desiredSet.has(i.url)).length;

      await db.vehicleImage.deleteMany({ where: { vehicleId: id } });
      if (desired.length > 0) {
        await db.vehicleImage.createMany({
          data: desired.map((url, idx) => ({ vehicleId: id, url, sortOrder: idx })),
        });
      }
      changed.push("images");
    }

    // Document management — id-keyed diff (update / create / delete).
    let docsAdded = 0;
    let docsUpdated = 0;
    let docsRemoved = 0;
    if (data.documents !== undefined) {
      const isPlatformAdmin = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
      const existing = await db.vehicleDocument.findMany({ where: { vehicleId: id } });
      const existingById = new Map(existing.map((d) => [d.id, d]));
      const keepIds = new Set<string>();

      for (const doc of data.documents) {
        const notes = doc.notes?.trim() || null;
        const fileUrl = doc.fileUrl?.trim() || null;
        let status = doc.status;

        const row = doc.id ? existingById.get(doc.id) : undefined;
        if (row) {
          keepIds.add(row.id);
          // Sellers cannot grant or revoke verification — an admin-set
          // VERIFIED/REJECTED survives seller edits untouched.
          if (!isPlatformAdmin && !isSellerWritableStatus(status)) status = row.status as typeof doc.status;
          await db.vehicleDocument.update({
            where: { id: row.id },
            data: { type: doc.type, status, notes, fileUrl },
          });
          docsUpdated += 1;
        } else {
          if (!isPlatformAdmin && !isSellerWritableStatus(status)) status = "PROVIDED";
          await db.vehicleDocument.create({
            data: { vehicleId: id, type: doc.type, status, notes, fileUrl },
          });
          docsAdded += 1;
        }
      }

      const removeIds = existing.filter((d) => !keepIds.has(d.id)).map((d) => d.id);
      if (removeIds.length > 0) {
        await db.vehicleDocument.deleteMany({ where: { id: { in: removeIds }, vehicleId: id } });
      }
      docsRemoved = removeIds.length;
      changed.push("documents");
    }

    if (changed.length > 0) {
      await db.auditLog.create({
        data: {
          actorId: actor.id,
          action: "LISTING_UPDATED",
          entity: "Vehicle",
          entityId: id,
          metaJson: JSON.stringify({
            fields: changed,
            imagesAdded,
            imagesRemoved,
            ...(data.documents !== undefined ? { documents: { added: docsAdded, updated: docsUpdated, removed: docsRemoved } } : {}),
          }),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/vehicles/[id] PATCH", "Failed to update vehicle");
  }
}
