import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { MetaDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publishedWhere = { status: "PUBLISHED" };

    const [makeRows, cityRows, priceAgg, yearAgg] = await Promise.all([
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
    ]);

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
    };

    return NextResponse.json(meta);
  } catch (err) {
    console.error("[api/meta] GET failed:", err);
    return NextResponse.json({ error: "Failed to load metadata" }, { status: 500 });
  }
}
