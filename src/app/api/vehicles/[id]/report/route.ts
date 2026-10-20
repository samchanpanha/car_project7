import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoUser } from "@/lib/session";
import { runChecks, REPORT_LIMITATIONS, type ComparableVehicle } from "@/lib/report/engine";
import { summarizeReport } from "@/lib/report/summarizer";
import type { ReportCheck, ReportDTO } from "@/lib/types";
import type { VehicleHistoryReport } from "@prisma/client";

export const dynamic = "force-dynamic";

function toReportDTO(row: VehicleHistoryReport): ReportDTO {
  let checks: ReportCheck[] = [];
  try {
    checks = JSON.parse(row.checksJson) as ReportCheck[];
  } catch {
    checks = [];
  }
  let limitations: { en: string; km: string }[] = REPORT_LIMITATIONS;
  if (row.limitationsJson) {
    try {
      limitations = JSON.parse(row.limitationsJson) as { en: string; km: string }[];
    } catch {
      limitations = REPORT_LIMITATIONS;
    }
  }
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    status: row.status,
    overallConfidence: row.overallConfidence,
    summaryEn: row.summaryEn,
    summaryKm: row.summaryKm,
    checks,
    limitations,
    createdAt: row.createdAt.toISOString(),
  };
}

function reportInclude() {
  return {
    documents: true,
    images: true,
    seller: { include: { sellerProfile: true } },
  } as const;
}

async function loadVehicleForReport(vehicleId: string) {
  return db.vehicle.findUnique({
    where: { id: vehicleId },
    include: reportInclude(),
  });
}

/** Same visibility rule as the detail route: never expose DRAFT/REJECTED. */
async function loadVisibleVehicle(vehicleId: string) {
  const vehicle = await loadVehicleForReport(vehicleId);
  if (!vehicle || vehicle.status === "DRAFT" || vehicle.status === "REJECTED") return null;
  return vehicle;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vehicle = await loadVisibleVehicle(id);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const report = await db.vehicleHistoryReport.findFirst({
      where: { vehicleId: id, status: "COMPLETE" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ report: report ? toReportDTO(report) : null });
  } catch (err) {
    console.error("[api/vehicles/[id]/report] GET failed:", err);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const vehicle = await loadVisibleVehicle(id);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const user = await getDemoUser();

    // Market comparables: PUBLISHED, same bodyType, not self, price > 0.
    // The engine additionally filters to |year diff| <= 2.
    const comparables: ComparableVehicle[] = await db.vehicle.findMany({
      where: { status: "PUBLISHED", bodyType: vehicle.bodyType, id: { not: id }, priceUsd: { gt: 0 } },
      select: { id: true, bodyType: true, year: true, priceUsd: true },
    });

    // (b) deterministic rules engine
    const { checks, overallConfidence } = await runChecks(
      vehicle,
      vehicle.documents,
      vehicle.images,
      comparables,
    );

    // (c) bilingual LLM summary (with deterministic fallback)
    const vehicleTitle = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const { summaryEn, summaryKm } = await summarizeReport(vehicleTitle, checks);

    // (d) replace previous reports, save fresh one
    await db.vehicleHistoryReport.deleteMany({ where: { vehicleId: id } });
    const saved = await db.vehicleHistoryReport.create({
      data: {
        vehicleId: id,
        checksJson: JSON.stringify(checks),
        overallConfidence,
        summaryEn,
        summaryKm,
        limitationsJson: JSON.stringify(REPORT_LIMITATIONS),
        status: "COMPLETE",
        requestedBy: user.id,
      },
    });

    return NextResponse.json({ report: toReportDTO(saved) });
  } catch (err) {
    console.error("[api/vehicles/[id]/report] POST failed:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
