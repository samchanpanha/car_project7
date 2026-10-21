import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";
import { savedSearchQuerySchema } from "@/lib/api/vehicle-filters";
import type { SavedSearchDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

const MAX_SAVED_SEARCHES = 20;

export async function GET() {
  try {
    const user = await getCurrentUser();

    const rows = await db.savedSearch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const items: SavedSearchDTO[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      query: safeParseQuery(r.queryJson),
      alertsEnabled: r.alertsEnabled,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/account/saved-searches GET", "Failed to load saved searches");
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  query: savedSearchQuerySchema,
  alertsEnabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const count = await db.savedSearch.count({ where: { userId: user.id } });
    if (count >= MAX_SAVED_SEARCHES) {
      return NextResponse.json(
        { error: `Saved search limit reached (max ${MAX_SAVED_SEARCHES})` },
        { status: 400 },
      );
    }

    const created = await db.savedSearch.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        queryJson: JSON.stringify(parsed.data.query),
        alertsEnabled: parsed.data.alertsEnabled ?? false,
      },
    });

    const dto: SavedSearchDTO = {
      id: created.id,
      name: created.name,
      query: parsed.data.query,
      alertsEnabled: created.alertsEnabled,
      createdAt: created.createdAt.toISOString(),
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, "api/account/saved-searches POST", "Failed to create saved search");
  }
}

function safeParseQuery(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string | number>;
    }
  } catch {
    // fall through
  }
  return {};
}
