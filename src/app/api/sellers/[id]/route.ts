import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCardDTO, toSellerFullDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { VehicleCardDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const seller = await db.user.findUnique({
      where: { id },
      include: { sellerProfile: true },
    });

    if (!seller || !seller.sellerProfile) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    }

    const listings = await db.vehicle.findMany({
      where: { sellerId: id, status: { in: ["PUBLISHED", "SOLD"] } },
      orderBy: { createdAt: "desc" },
      include: vehicleCardInclude,
    });

    return NextResponse.json({
      seller: toSellerFullDTO(seller),
      listings: listings.map(toCardDTO) satisfies VehicleCardDTO[],
    });
  } catch (err) {
    console.error("[api/sellers/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load seller" }, { status: 500 });
  }
}
