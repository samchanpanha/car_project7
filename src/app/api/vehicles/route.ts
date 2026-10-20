import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDemoUser } from "@/lib/session";
import { toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { Prisma } from "@prisma/client";
import type { SortOption, VehiclesResponseDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const SORTS: SortOption[] = ["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"];

function num(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;

    const limitRaw = num(sp.get("limit")) ?? 12;
    const limit = Math.min(Math.max(Math.trunc(limitRaw), 1), 48);
    const cursorRaw = Math.max(0, Math.trunc(num(sp.get("cursor")) ?? 0));
    const q = sp.get("q")?.trim().toLowerCase() || undefined;
    const make = sp.get("make") || undefined;
    const bodyType = sp.get("bodyType") || undefined;
    const fuel = sp.get("fuel") || undefined;
    const transmission = sp.get("transmission") || undefined;
    const city = sp.get("city") || undefined;
    const sellerType = sp.get("sellerType") || undefined; // PRIVATE | DEALER
    const sellerVerified = sp.get("sellerVerified") === "true";
    const priceMin = num(sp.get("priceMin"));
    const priceMax = num(sp.get("priceMax"));
    const yearMin = num(sp.get("yearMin"));
    const yearMax = num(sp.get("yearMax"));
    const mileageMax = num(sp.get("mileageMax"));
    const sortParam = sp.get("sort") || "newest";
    const sort: SortOption = SORTS.includes(sortParam as SortOption)
      ? (sortParam as SortOption)
      : "newest";

    // Structured filters are applied at DB level.
    const where: Prisma.VehicleWhereInput = { status: "PUBLISHED" };
    if (make) where.make = make;
    if (bodyType) where.bodyType = bodyType;
    if (fuel) where.fuel = fuel;
    if (transmission) where.transmission = transmission;
    if (city) where.city = city;
    if (priceMin != null || priceMax != null) {
      where.priceUsd = {
        ...(priceMin != null ? { gte: priceMin } : {}),
        ...(priceMax != null ? { lte: priceMax } : {}),
      };
    }
    if (yearMin != null || yearMax != null) {
      where.year = {
        ...(yearMin != null ? { gte: yearMin } : {}),
        ...(yearMax != null ? { lte: yearMax } : {}),
      };
    }
    if (mileageMax != null) where.mileageKm = { lte: mileageMax };
    if (sellerType || sellerVerified) {
      const profile: Prisma.SellerProfileWhereInput = {};
      if (sellerType) profile.type = sellerType;
      if (sellerVerified) profile.verified = true;
      where.seller = { sellerProfile: profile };
    }

    // Fetch matches (MVP scale: small dataset) — q needs case-insensitive matching,
    // which SQLite + Prisma does not support, so we filter/sort/paginate in JS.
    const matches = await db.vehicle.findMany({
      where,
      include: vehicleCardInclude,
      orderBy: { createdAt: "desc" },
    });

    const filtered = q
      ? matches.filter((v) =>
          `${v.make} ${v.model} ${v.variant ?? ""}`.toLowerCase().includes(q),
        )
      : matches;

    switch (sort) {
      case "price_asc":
        filtered.sort((a, b) => a.priceUsd - b.priceUsd);
        break;
      case "price_desc":
        filtered.sort((a, b) => b.priceUsd - a.priceUsd);
        break;
      case "year_desc":
        filtered.sort((a, b) => b.year - a.year);
        break;
      case "mileage_asc":
        filtered.sort((a, b) => a.mileageKm - b.mileageKm);
        break;
      default:
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const total = filtered.length;
    const start = cursorRaw * limit;
    const pageItems = filtered.slice(start, start + limit);
    const nextCursor = start + limit < total ? String(cursorRaw + 1) : null;

    const response: VehiclesResponseDTO = {
      items: pageItems.map(toCardDTO),
      nextCursor,
      total,
    };
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
  drivetrain: z.enum(["FWD", "RWD", "AWD"]).optional().nullable(),
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
  images: z.array(z.string().min(1)).optional(),
});

export async function POST(req: Request) {
  try {
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

    const vehicle = await db.vehicle.create({
      data: {
        sellerId: seller.id,
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
      },
      select: { id: true },
    });

    return NextResponse.json({ vehicle: { id: vehicle.id } }, { status: 201 });
  } catch (err) {
    console.error("[api/vehicles] POST failed:", err);
    return NextResponse.json({ error: "Failed to create vehicle" }, { status: 500 });
  }
}
