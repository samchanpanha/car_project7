import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { MetaDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publishedWhere = { status: "PUBLISHED" };

    const [makeRows, cityRows, priceAgg, yearAgg, sellerRows] = await Promise.all([
      db.vehicle.findMany({
        where: publishedWhere,
        select: { make: true },
        distinct: ["make"],
        orderBy: { make: "asc" },
      }),
      db.vehicle.findMany({
        where: publishedWhere,
        select: { city: true },
        distinct: ["city"],
        orderBy: { city: "asc" },
      }),
      db.vehicle.aggregate({
        where: { ...publishedWhere, priceUsd: { gt: 0 } },
        _min: { priceUsd: true },
        _max: { priceUsd: true },
      }),
      db.vehicle.aggregate({
        where: publishedWhere,
        _min: { year: true },
        _max: { year: true },
      }),
      db.user.findMany({
        where: {
          vehiclesSold: {
            some: publishedWhere,
          },
        },
        select: {
          id: true,
          name: true,
          sellerProfile: {
            select: {
              type: true,
              shopName: true,
              verified: true,
            },
          },
          _count: {
            select: {
              vehiclesSold: {
                where: publishedWhere,
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const sellers = sellerRows
      .map((s) => ({
        id: s.id,
        name: s.name,
        shopName: s.sellerProfile?.shopName || null,
        type: (s.sellerProfile?.type === "DEALER" ? "DEALER" : "PRIVATE") as "DEALER" | "PRIVATE",
        verified: Boolean(s.sellerProfile?.verified),
        count: s._count.vehiclesSold,
      }))
      .sort((a, b) => b.count - a.count);

    const meta: MetaDTO = {
      makes: makeRows.map((r) => r.make),
      cities: cityRows.map((r) => r.city),
      bodyTypes: ["SUV", "SEDAN", "PICKUP", "HATCHBACK", "VAN", "COUPE"],
      fuelTypes: ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"],
      transmissions: ["AUTOMATIC", "MANUAL"],
      priceMin: priceAgg._min.priceUsd ?? 1000,
      priceMax: priceAgg._max.priceUsd ?? 100000,
      yearMin: yearAgg._min.year ?? 2000,
      yearMax: yearAgg._max.year ?? 2025,
      sellers,
    };

    return NextResponse.json(meta);
  } catch (err) {
    console.error("[api/meta] GET failed:", err);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}

