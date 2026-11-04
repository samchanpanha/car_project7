import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { z } from "zod";

const createPriceTypeSchema = z.object({
  code: z.string().min(2).max(64).transform((v) => v.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_")),
  label: z.string().min(2).max(128).trim(),
  mode: z.enum(["FIXED", "PERCENT"]).default("FIXED"),
  badgeColor: z.string().min(2).max(32).default("#EF4444"),
  priority: z.number().int().default(0),
  stackable: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function GET() {
  try {
    const priceTypes = await db.priceType.findMany({
      orderBy: { priority: "desc" },
    });
    return NextResponse.json({ priceTypes });
  } catch (err) {
    return toErrorResponse(err, "GET /api/pricing/types", "Failed to fetch price types");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = createPriceTypeSchema.parse(body);

    const priceType = await db.priceType.create({
      data: parsed,
    });

    return NextResponse.json({ priceType }, { status: 201 });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid price type payload", issues: err.issues }, { status: 400 });
    }
    return toErrorResponse(err, "POST /api/pricing/types", "Failed to create price type");
  }
}

