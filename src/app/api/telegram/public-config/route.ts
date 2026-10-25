import { NextResponse } from "next/server";
import { readTelegramConfig } from "@/lib/telegram-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await readTelegramConfig();
    return NextResponse.json({
      botUsername: config.botUsername,
      miniAppUrl: config.miniAppUrl,
      channelUrl: config.channelUrl,
      groupUrl: config.groupUrl,
      tmaEnabled: config.tmaEnabled,
    });
  } catch (err) {
    console.error("[api/telegram/public-config] GET failed:", err);
    return NextResponse.json({
      botUsername: "KhLanBot",
      miniAppUrl: "https://t.me/KhLanBot/app",
      channelUrl: "https://t.me/KhLanOfficial",
      groupUrl: "https://t.me/KhLanGroup",
      tmaEnabled: true,
    });
  }
}
