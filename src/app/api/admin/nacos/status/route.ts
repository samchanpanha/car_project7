import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { checkNacosHealth, listNacosConfigs, getNacosEndpoint } from "@/lib/nacos-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const [health, configs] = await Promise.all([
      checkNacosHealth(),
      listNacosConfigs(),
    ]);

    return NextResponse.json({
      endpoint: getNacosEndpoint(),
      health,
      configs,
    });
  } catch (err) {
    return toErrorResponse(err, "api/admin/nacos/status GET", "Failed to retrieve Nacos status");
  }
}
