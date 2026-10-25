import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { syncPendingFilesToR2 } from "@/lib/storage-resilience";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
    const result = await syncPendingFilesToR2();
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err, "api/admin/storage/sync-r2 POST", "Failed to sync files to Cloudflare R2");
  }
}
