import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import type { PlatformSettingsDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const SETTING_KEYS = [
  "commissionPct",
  "featuredListingPriceUsd",
  "autoApproveListings",
  "maintenanceMode",
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULT_SETTINGS: PlatformSettingsDTO = {
  commissionPct: 2.5,
  featuredListingPriceUsd: 25,
  autoApproveListings: false,
  maintenanceMode: false,
};

async function readSettings(): Promise<PlatformSettingsDTO> {
  const rows = await db.platformSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  const settings: PlatformSettingsDTO = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    const raw = byKey.get(key);
    if (raw == null) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed != null) {
        (settings as Record<SettingKey, unknown>)[key] = parsed;
      }
    } catch {
      // Malformed stored value — keep default.
    }
  }
  return settings;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await readSettings());
  } catch (err) {
    return toErrorResponse(err, "api/admin/settings GET", "Failed to load settings");
  }
}

const putSchema = z.object({
  commissionPct: z.number().min(0).max(100),
  featuredListingPriceUsd: z.number().min(0),
  autoApproveListings: z.boolean(),
  maintenanceMode: z.boolean(),
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

    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    for (const key of SETTING_KEYS) {
      const valueJson = JSON.stringify(parsed.data[key]);
      await db.platformSetting.upsert({
        where: { key },
        create: { key, valueJson },
        update: { valueJson },
      });
    }

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "SETTINGS_UPDATED",
        entity: "PlatformSetting",
        metaJson: JSON.stringify(parsed.data),
      },
    });

    return NextResponse.json(parsed.data satisfies PlatformSettingsDTO);
  } catch (err) {
    return toErrorResponse(err, "api/admin/settings PUT", "Failed to save settings");
  }
}
