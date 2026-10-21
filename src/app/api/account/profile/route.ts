import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["en", "km", "zh", "vi"]).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  phone: z.string().regex(/^\+855\d{7,9}$/).optional(),
});

/** Personal configuration — available to every logged-in user (all roles). */
export async function PATCH(req: Request) {
  try {
    const me = await getAuthUser();
    if (!me) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = profileSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${first?.path.join(".") ?? "body"}: ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const { name, locale, avatarUrl, phone } = parsed.data;

    // Phone changes: uniqueness + re-verification required.
    let phoneVerified: boolean | undefined = undefined;
    if (phone && phone !== me.phone) {
      const clash = await db.user.findUnique({ where: { phone }, select: { id: true } });
      if (clash) {
        return NextResponse.json({ error: "This phone number is already in use" }, { status: 400 });
      }
      phoneVerified = false;
    }

    const updated = await db.user.update({
      where: { id: me.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(locale !== undefined ? { locale } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(phoneVerified !== undefined ? { phoneVerified } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        actorId: me.id,
        action: "PROFILE_UPDATED",
        entity: "User",
        entityId: me.id,
        metaJson: JSON.stringify({
          fields: Object.keys(parsed.data),
          ...(phone ? { phoneChanged: phone !== me.phone } : {}),
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        locale: updated.locale,
        avatarUrl: updated.avatarUrl,
        phone: updated.phone,
        phoneVerified: updated.phoneVerified,
      },
    });
  } catch (err) {
    return toErrorResponse(err, "api/account/profile PATCH", "Failed to update profile");
  }
}
