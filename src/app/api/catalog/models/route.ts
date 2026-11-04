import { NextRequest, NextResponse } from "next/server";
import { getCatalogModels } from "@/lib/api/catalog";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "CAR";
    const make = searchParams.get("make") || "";
    const models = await getCatalogModels(category, make);
    return NextResponse.json({ models });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch models" }, { status: 500 });
  }
}

