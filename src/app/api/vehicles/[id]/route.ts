import { NextRequest, NextResponse } from "next/server";
import { getVehicleDetailPayload } from "@/lib/api/vehicle-detail";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing vehicle ID" }, { status: 400 });
    }

    const payload = await getVehicleDetailPayload(id);

    if (!payload) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[VehicleDetailAPI] Error fetching vehicle detail:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch vehicle detail" },
      { status: 500 }
    );
  }
}
