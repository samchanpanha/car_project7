import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import type { MyListingRowDTO } from "@/lib/listing-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/vehicles/mine — the signed-in user's own private listings
 * (created by them or attributed to their account, outside any tenant).
 * Tenant fleet stock is managed through /api/tenant/inventory instead.
 * Powers the "Your listings" editor in the sell view and seller dashboard.
 */
export async function GET(req: Request) {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actor = await getCurrentUser();
    const sp = new URL(req.url).searchParams;

    const status = sp.get("status") || undefined;
    const q = sp.get("q")?.trim() || undefined;
    const sort = sp.get("sort") || "newest";

    const where: any = {
      tenantId: null,
      OR: [{ createdById: actor.id }, { sellerId: actor.id }],
      ...(status && status !== "ALL" ? { status } : {}),
    };

    if (q) {
      where.AND = [
        {
          OR: [
            { make: { contains: q } },
            { model: { contains: q } },
            { vinLast6: { contains: q } },
            { plateNo: { contains: q } },
          ],
        },
      ];
    }

    let orderBy: any = { createdAt: "desc" };
    if (sort === "price_asc") orderBy = { priceUsd: "asc" };
    else if (sort === "price_desc") orderBy = { priceUsd: "desc" };
    else if (sort === "views") orderBy = { views: "desc" };
    else if (sort === "year_desc") orderBy = { year: "desc" };

    const total = await db.vehicle.count({ where });

    const pageParam = sp.get("page");
    const limitParam = sp.get("limit");

    if (pageParam || sp.get("paged") === "true") {
      const page = Math.max(1, parseInt(pageParam || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(limitParam || "20", 10)));
      const skip = (page - 1) * limit;

      const rows = await db.vehicle.findMany({
        where,
        include: { images: true },
        orderBy,
        skip,
        take: limit,
      });

      const items: MyListingRowDTO[] = rows.map((v: any) => ({
        id: v.id,
        listingCategory: v.listingCategory ?? "CAR",
        partCategory: v.partCategory ?? null,
        partTarget: v.partTarget ?? null,
        partCondition: v.partCondition ?? null,
        compatibleModels: v.compatibleModels ?? null,
        partNumber: v.partNumber ?? null,
        make: v.make,
        model: v.model,
        variant: v.variant,
        year: v.year,
        priceUsd: v.priceUsd,
        priceMasked: Boolean(v.priceMasked),
        mileageKm: v.mileageKm,
        status: v.status as MyListingRowDTO["status"],
        featured: v.featured,
        views: v.views,
        createdAt: v.createdAt.toISOString(),
        images: [...v.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
      }));

      return NextResponse.json({
        items,
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      });
    }

    // Default backward compatible array response
    const rows = await db.vehicle.findMany({
      where,
      include: { images: true },
      orderBy,
      take: 500,
    });

    const items: MyListingRowDTO[] = rows.map((v: any) => ({
      id: v.id,
      listingCategory: v.listingCategory ?? "CAR",
      partCategory: v.partCategory ?? null,
      partTarget: v.partTarget ?? null,
      partCondition: v.partCondition ?? null,
      compatibleModels: v.compatibleModels ?? null,
      partNumber: v.partNumber ?? null,
      make: v.make,
      model: v.model,
      variant: v.variant,
      year: v.year,
      priceUsd: v.priceUsd,
      priceMasked: Boolean(v.priceMasked),
      mileageKm: v.mileageKm,
      status: v.status as MyListingRowDTO["status"],
      featured: v.featured,
      views: v.views,
      createdAt: v.createdAt.toISOString(),
      images: [...v.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url),
    }));

    return NextResponse.json(items, {
      headers: { "x-total-count": String(total) },
    });
  } catch (err) {
    console.error("[api/vehicles/mine] GET failed:", err);
    return NextResponse.json({ error: "Failed to load your listings" }, { status: 500 });
  }
}
