import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { readTelegramConfig, saveTelegramConfig } from "@/lib/telegram-config";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const config = await readTelegramConfig();
    return NextResponse.json(config);
  } catch (err) {
    return toErrorResponse(err, "api/admin/telegram GET", "Failed to load Telegram configuration");
  }
}

const telegramPutSchema = z.object({
  botUsername: z.string().trim().nullable().optional(),
  botToken: z.string().trim().nullable().optional(),
  chatId: z.string().trim().nullable().optional(),
  miniAppUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  channelUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  groupUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  tmaEnabled: z.boolean().default(true),
  autoAuthEnabled: z.boolean().default(true),
  leadAlertsEnabled: z.boolean().default(true),
});

export async function PUT(req: Request) {
  try {
    const admin = await requireAdmin();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = telegramPutSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const cleanUrl = (val: string | null | undefined) => (val && val.trim().length > 0 ? val.trim() : null);

    const saved = await saveTelegramConfig({
      botUsername: data.botUsername ? data.botUsername.replace(/^@/, "").trim() : null,
      botToken: data.botToken ? data.botToken.trim() : null,
      chatId: data.chatId ? data.chatId.trim() : null,
      miniAppUrl: cleanUrl(data.miniAppUrl),
      channelUrl: cleanUrl(data.channelUrl),
      groupUrl: cleanUrl(data.groupUrl),
      tmaEnabled: data.tmaEnabled,
      autoAuthEnabled: data.autoAuthEnabled,
      leadAlertsEnabled: data.leadAlertsEnabled,
    });

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "TELEGRAM_CONFIG_UPDATED",
        entity: "PlatformSetting",
        entityId: "telegram.platformConfig",
        metaJson: JSON.stringify({
          botUsername: saved.botUsername,
          tmaEnabled: saved.tmaEnabled,
          autoAuthEnabled: saved.autoAuthEnabled,
          leadAlertsEnabled: saved.leadAlertsEnabled,
        }),
      },
    });

    return NextResponse.json(saved);
  } catch (err) {
    return toErrorResponse(err, "api/admin/telegram PUT", "Failed to update Telegram configuration");
  }
}
