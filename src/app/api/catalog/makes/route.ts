import { NextRequest, NextResponse } from "next/server";
import { getCatalogMakes } from "@/lib/api/catalog";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "CAR";
    const makes = await getCatalogMakes(category);
    return NextResponse.json({ makes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch makes" }, { status: 500 });
  }
}

