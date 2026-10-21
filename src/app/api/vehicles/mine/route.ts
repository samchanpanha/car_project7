import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import type { MyListingRowDTO } from "@/lib/listing-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/vehicles/mine — the signed-in user's own private listings
 * (created by them or attributed to their account, outside any tenant).
 * Tenant fleet stock is managed through /api/tenant/inventory instead.
 * Powers the "Your listings" editor in the sell view.
 */
export async function GET() {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actor = await getCurrentUser();

    const rows = await db.vehicle.findMany({
      where: {
        tenantId: null,
        OR: [{ createdById: actor.id }, { sellerId: actor.id }],
      },
      include: { images: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const items: MyListingRowDTO[] = rows.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      variant: v.variant,
      year: v.year,
      priceUsd: v.priceUsd,
      mileageKm: v.mileageKm,
      status: v.status as MyListingRowDTO["status"],
      featured: v.featured,
      views: v.views,
      createdAt: v.createdAt.toISOString(),
      images: [...v.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    }));
    return NextResponse.json(items);
  } catch (err) {
    console.error("[api/vehicles/mine] GET failed:", err);
    return NextResponse.json({ error: "Failed to load your listings" }, { status: 500 });
  }
}
