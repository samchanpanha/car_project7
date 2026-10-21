import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import type { ReportCheck } from "@/lib/types";
import type { AiStatsDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const [totalReports, completeReports, completes, recent] = await Promise.all([
      db.vehicleHistoryReport.count(),
      db.vehicleHistoryReport.count({ where: { status: "COMPLETE" } }),
      db.vehicleHistoryReport.findMany({ where: { status: "COMPLETE" } }),
      db.vehicleHistoryReport.findMany({
        where: { status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { vehicle: { select: { make: true, model: true, year: true } } },
      }),
    ]);

    const avgConfidence = completeReports
      ? Math.round(
          completes.reduce((sum, r) => sum + r.overallConfidence, 0) / completeReports,
        )
      : 0;

    const statusBreakdown: Record<string, number> = {};
    for (const report of completes) {
      try {
        const checks = JSON.parse(report.checksJson) as Pick<ReportCheck, "status">[];
        for (const check of Array.isArray(checks) ? checks : []) {
          if (check && typeof check.status === "string") {
            statusBreakdown[check.status] = (statusBreakdown[check.status] ?? 0) + 1;
          }
        }
      } catch {
        // Malformed report JSON — skip its checks.
      }
    }

    const dto: AiStatsDTO = {
      totalReports,
      completeReports,
      avgConfidence,
      statusBreakdown,
      recent: recent.map((r) => ({
        id: r.id,
        vehicleLabel: `${r.vehicle.make} ${r.vehicle.model} ${r.vehicle.year}`,
        confidence: Math.round(r.overallConfidence),
        createdAt: r.createdAt.toISOString(),
      })),
    };
    return NextResponse.json(dto);
  } catch (err) {
    return toErrorResponse(err, "api/admin/ai GET", "Failed to load AI stats");
  }
}
