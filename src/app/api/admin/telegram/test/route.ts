import { NextResponse } from "next/server";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { testTelegramBotConnection } from "@/lib/telegram-config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    let token: string | undefined;
    try {
      const json = await req.json();
      if (json && typeof json.botToken === "string") {
        token = json.botToken.trim();
      }
    } catch {
      // Body is optional; falls back to saved/env token
    }

    const status = await testTelegramBotConnection(token);
    return NextResponse.json(status);
  } catch (err) {
    return toErrorResponse(err, "api/admin/telegram/test POST", "Failed to test bot connection");
  }
}
