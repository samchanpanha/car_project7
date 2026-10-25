import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { syncAllConfigsToNacos } from "@/lib/nacos-client";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
    const result = await syncAllConfigsToNacos();
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err, "api/admin/nacos/sync POST", "Failed to sync configurations to Nacos");
  }
}
