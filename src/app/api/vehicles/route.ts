import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoUser, getCurrentUser, isGuestRequest } from "@/lib/session";
import { documentInputSchema, isSellerWritableStatus } from "@/lib/api/documents";
import { listVehicles } from "@/lib/api/vehicle-filters";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // Shared filter/sort/pagination path (also used by saved-search runs).
    // Advanced params: priceMin/priceMax, yearMin/yearMax, mileageMin/mileageMax,
    // fuel/transmission/drivetrain/bodyType (comma-separated), condition,
    // featured=true, hasReport=true — plus all legacy params.
    const response = await listVehicles(new URL(req.url).searchParams);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/vehicles] GET failed:", err);
    return NextResponse.json({ error: "Failed to list vehicles" }, { status: 500 });
  }
}

const createVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  variant: z.string().optional().nullable(),
  year: z.number().int().min(1990).max(2026),
  priceUsd: z.number().positive(),
  mileageKm: z.number().int().min(0),
  transmission: z.enum(["AUTOMATIC", "MANUAL"]),
  fuel: z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]),
  engineCc: z.number().int().optional().nullable(),
  drivetrain: z.enum(["FWD", "RWD", "AWD", "4WD"]).optional().nullable(),
  bodyType: z.enum(["SUV", "SEDAN", "PICKUP", "HATCHBACK", "VAN", "COUPE"]),
  exteriorColor: z.string().optional().nullable(),
  city: z.string().default("Phnom Penh"),
  district: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionKm: z.string().optional().nullable(),
  vinLast6: z.string().max(6).optional().nullable(),
  plateNo: z.string().optional().nullable(),
  ownershipCount: z.number().int().optional().nullable(),
  accidentDeclared: z
    .enum(["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"])
    .default("UNKNOWN"),
  importOrigin: z.enum(["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"]).optional().nullable(),
  branchId: z.string().optional().nullable(),
  images: z.array(z.string().min(1)).optional(),
  // Optional vehicle papers — sellers declare them at creation time too.
  documents: z.array(documentInputSchema.omit({ id: true })).max(30).optional(),
});

export async function POST(req: Request) {
  try {
    // Listing creation is an account action — guests must register first.
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createVehicleSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const seller = await getDemoUser();

    // plan gate — a signed-in tenant member can only hold as many published
    // Subscription & Free Trial Gate:
    // Selling cars requires an active subscription or free trial. Staff (ADMIN / SUPER_ADMIN) are exempt.
    const actor = await getCurrentUser();
    const isStaff = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";

    const membership = await db.tenantMember.findFirst({
      where: { userId: actor.id, status: "ACTIVE" },
      include: { tenant: { include: { subscription: true } } },
    });

    if (!isStaff) {
      const { readPlatformSettings, sellerTrialWindow } = await import("@/lib/platform-settings");
      const settings = await readPlatformSettings();
      const trial = sellerTrialWindow(actor.createdAt, settings.freeTrialDays, settings.freeTrialEnabled);
      const hasActiveTrial = trial.enabled && !trial.expired;

      const tenantSub = membership?.tenant?.subscription;
      const hasActivePaidSub = Boolean(tenantSub && tenantSub.status === "ACTIVE" && tenantSub.plan !== "FREE");

      if (!hasActiveTrial && !hasActivePaidSub) {
        return NextResponse.json(
          {
            error: "Selling cars requires an active subscription or free trial. Please complete payment for a subscription plan to publish vehicle listings.",
            code: "SUBSCRIPTION_REQUIRED",
          },
          { status: 403 },
        );
      }

      // Check published listings limit
      const listingsLimit = hasActivePaidSub ? (tenantSub?.listingsLimit ?? 15) : (settings.freeTrialEnabled ? 15 : 0);
      const publishedCount = await db.vehicle.count({
        where: membership ? { tenantId: membership.tenantId, status: "PUBLISHED" } : { createdById: actor.id, status: "PUBLISHED" },
      });
      if (publishedCount >= listingsLimit) {
        return NextResponse.json(
          {
            error: `Listing limit reached (${listingsLimit}) — please upgrade your subscription to publish more vehicles`,
            code: "PLAN_LIMIT_LISTINGS",
          },
          { status: 402 },
        );
      }
    }

    const vehicle = await db.vehicle.create({
      data: {
        sellerId: seller.id,
        // Remember who actually created the listing ("my listings" ownership
        // + edit authorization), and file it under the tenant stock when the
        // author belongs to a dealership so it lands in their inventory tab.
        createdById: actor.id,
        ...(membership ? { tenantId: membership.tenantId } : {}),
        branchId: data.branchId ?? null,
        make: data.make,
        model: data.model,
        variant: data.variant ?? null,
        year: data.year,
        priceUsd: data.priceUsd,
        mileageKm: data.mileageKm,
        transmission: data.transmission,
        fuel: data.fuel,
        engineCc: data.engineCc ?? null,
        drivetrain: data.drivetrain ?? null,
        bodyType: data.bodyType,
        exteriorColor: data.exteriorColor ?? null,
        city: data.city,
        district: data.district ?? null,
        description: data.description ?? null,
        descriptionKm: data.descriptionKm ?? null,
        status: "PUBLISHED",
        featured: false,
        vinLast6: data.vinLast6 ?? null,
        plateNo: data.plateNo ?? null,
        ownershipCount: data.ownershipCount ?? null,
        accidentDeclared: data.accidentDeclared,
        importOrigin: data.importOrigin ?? null,
        images: {
          create: (data.images ?? []).map((url, idx) => ({ url, sortOrder: idx })),
        },
        documents: {
          create: (data.documents ?? []).map((d) => ({
            type: d.type,
            // Creation is a seller action — verification statuses are clamped.
            status: isSellerWritableStatus(d.status) ? d.status : "PROVIDED",
            notes: d.notes?.trim() || null,
            fileUrl: d.fileUrl?.trim() || null,
          })),
        },
      } as any,
      select: { id: true },
    });

    return NextResponse.json({ vehicle: { id: vehicle.id } }, { status: 201 });
  } catch (err) {
    console.error("[api/vehicles] POST failed:", err);
    return NextResponse.json({ error: "Failed to create vehicle" }, { status: 500 });
  }
}
