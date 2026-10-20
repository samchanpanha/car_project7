import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { listVehicles, queryToSearchParams } from "@/lib/api/vehicle-filters";
import type { VehicleCardDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const RUN_LIMIT = 12;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    const row = await db.savedSearch.findFirst({ where: { id, userId: user.id } });
    if (!row) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    let query: Record<string, string | number> = {};
    try {
      const parsed = JSON.parse(row.queryJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        query = parsed as Record<string, string | number>;
      }
    } catch {
      // Malformed stored query — run with no filters.
    }

    // Same filter code path as GET /api/vehicles; fixed first page of 12.
    const sp = queryToSearchParams(query);
    sp.set("limit", String(RUN_LIMIT));
    sp.delete("cursor");
    const { total, items } = await listVehicles(sp);

    const vehicles: VehicleCardDTO[] = items;
    return NextResponse.json({ total, vehicles });
  } catch (err) {
    return toErrorResponse(err, "api/account/saved-searches/[id]/run POST", "Failed to run saved search");
  }
}
