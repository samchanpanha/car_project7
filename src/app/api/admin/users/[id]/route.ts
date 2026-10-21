import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["BUYER", "SELLER", "DEALER", "ADMIN", "SUPER_ADMIN"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db.user.update({ where: { id }, data: { role: parsed.data.role } });

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "USER_ROLE_CHANGED",
        entity: "User",
        entityId: id,
        metaJson: JSON.stringify({ from: user.role, to: parsed.data.role }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/admin/users/[id] PATCH", "Failed to update user role");
  }
}
