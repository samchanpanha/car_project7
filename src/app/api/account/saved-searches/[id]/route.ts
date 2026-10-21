import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    const row = await db.savedSearch.findFirst({ where: { id, userId: user.id } });
    if (!row) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    await db.savedSearch.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "api/account/saved-searches/[id] DELETE", "Failed to delete saved search");
  }
}
