import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";

export async function GET() {
  try {
    const priceTypes = await db.priceType.findMany({
      where: { active: true },
      orderBy: { priority: "desc" },
    });
    return NextResponse.json({ priceTypes, types: priceTypes });
  } catch (err) {
    return toErrorResponse(err, "GET /api/seller/pricing/available-types", "Failed to fetch price types");
  }
}

