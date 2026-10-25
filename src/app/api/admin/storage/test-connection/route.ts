import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { testR2Connection } from "@/lib/r2-client";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
    const result = await testR2Connection();
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err, "api/admin/storage/test-connection POST", "Failed to test Cloudflare R2 connection");
  }
}
