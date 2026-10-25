import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { getStorageResilienceStatus } from "@/lib/storage-resilience";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const status = await getStorageResilienceStatus();
    return NextResponse.json(status);
  } catch (err) {
    return toErrorResponse(err, "api/admin/storage/status GET", "Failed to get storage status");
  }
}
