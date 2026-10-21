import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseMetaJson, requireAdmin, toErrorResponse } from "@/lib/api/guards";
import type { AuditEntryDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

function num(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const limitRaw = num(new URL(req.url).searchParams.get("limit")) ?? 50;
    const limit = Math.min(Math.max(Math.trunc(limitRaw), 1), 200);

    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });

    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x)),
    ];
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorNames = new Map(actors.map((a) => [a.id, a.name]));

    const rows: AuditEntryDTO[] = logs.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      actorName: l.actorId ? (actorNames.get(l.actorId) ?? null) : null,
      createdAt: l.createdAt.toISOString(),
      meta: parseMetaJson(l.metaJson),
    }));

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(err, "api/admin/audit GET", "Failed to load audit log");
  }
}
