import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import type { AccountOverviewDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();

    const [favorites, savedSearches, appointments, reportsGenerated, messagesCount, myReports] =
      await Promise.all([
        db.favorite.count({ where: { userId: user.id } }),
        db.savedSearch.count({ where: { userId: user.id } }),
        db.appointment.count({
          where: { buyerId: user.id, status: { not: "CANCELLED" } },
        }),
        db.vehicleHistoryReport.count({ where: { requestedBy: user.id } }),
        db.conversation.count({ where: { buyerId: user.id } }),
        db.vehicleHistoryReport.findMany({
          where: { requestedBy: user.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { vehicle: { select: { id: true, make: true, model: true, year: true } } },
        }),
      ]);

    // COMPLETE reports first, newest first within each group (stable sort).
    const ordered = [...myReports].sort(
      (a, b) => Number(b.status === "COMPLETE") - Number(a.status === "COMPLETE"),
    );

    const dto: AccountOverviewDTO = {
      favorites,
      savedSearches,
      appointments,
      reportsGenerated,
      messagesCount,
      recentReports: ordered.slice(0, 5).map((r) => ({
        id: r.id,
        vehicleId: r.vehicle.id,
        vehicleLabel: `${r.vehicle.make} ${r.vehicle.model} ${r.vehicle.year}`,
        confidence: Math.round(r.overallConfidence),
        createdAt: r.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/account/overview GET", "Failed to load account overview");
  }
}
