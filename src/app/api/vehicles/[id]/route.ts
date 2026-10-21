import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCardDTO, toDetailDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { VehicleCardDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vehicle = await db.vehicle.findUnique({
      where: { id },
      include: vehicleCardInclude,
    });

    // Never expose DRAFT/REJECTED listings; missing → 404 too.
    if (!vehicle || vehicle.status === "DRAFT" || vehicle.status === "REJECTED") {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Count the view.
    await db.vehicle.update({ where: { id }, data: { views: { increment: 1 } } });

    const [latestReport, similarRows] = await Promise.all([
      db.vehicleHistoryReport.findFirst({
        where: { vehicleId: id, status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, overallConfidence: true },
      }),
      db.vehicle.findMany({
        where: {
          status: "PUBLISHED",
          id: { not: id },
          OR: [{ bodyType: vehicle.bodyType }, { make: vehicle.make }],
        },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: vehicleCardInclude,
      }),
    ]);

    const detail = toDetailDTO(vehicle);
    detail.views = vehicle.views + 1; // reflect the just-counted view
    detail.report = latestReport
      ? {
          id: latestReport.id,
          createdAt: latestReport.createdAt.toISOString(),
          overallConfidence: latestReport.overallConfidence,
        }
      : null;

    const similar: VehicleCardDTO[] = similarRows.map(toCardDTO);

    return NextResponse.json({ vehicle: detail, similar });
  } catch (err) {
    console.error("[api/vehicles/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load vehicle" }, { status: 500 });
  }
}
