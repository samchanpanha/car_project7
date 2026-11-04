import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { HttpError, toErrorResponse } from "@/lib/api/guards";
import { getCurrentUser } from "@/lib/session";
import { z } from "zod";

const updatePriceTypeSchema = z.object({
  label: z.string().min(2).max(128).optional(),
  mode: z.enum(["FIXED", "PERCENT"]).optional(),
  badgeColor: z.string().min(2).max(32).optional(),
  priority: z.number().int().optional(),
  stackable: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const isAllowed =
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "DEALER" ||
      user.role === "SELLER";
    if (!isAllowed) {
      throw new HttpError(403, "Forbidden");
    }
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updatePriceTypeSchema.parse(body);

    const priceType = await db.priceType.update({
      where: { id },
      data: parsed,
    });

    return NextResponse.json({ priceType });
  } catch (err) {
    return toErrorResponse(err, "PATCH /api/pricing/types/[id]", "Failed to update price type");
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const isAllowed =
      user.role === "SUPER_ADMIN" ||
      user.role === "ADMIN" ||
      user.role === "DEALER" ||
      user.role === "SELLER";
    if (!isAllowed) {
      throw new HttpError(403, "Forbidden");
    }
    const { id } = await context.params;

    // Soft disable or delete if no references
    const count = await db.itemPrice.count({ where: { priceTypeId: id } });
    if (count > 0) {
      const priceType = await db.priceType.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({ message: "Price type deactivated due to existing items", priceType });
    }

    await db.priceType.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err, "DELETE /api/pricing/types/[id]", "Failed to delete price type");
  }
}

