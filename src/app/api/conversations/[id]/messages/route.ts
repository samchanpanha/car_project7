import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import type { MessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const postMessageSchema = z.object({
  body: z.string().min(2, "body must be at least 2 characters"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Login required to send messages" }, { status: 401 });
    }

    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = postMessageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "body (min 2 chars) is required" }, { status: 400 });
    }

    const user = await getCurrentUser();

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        vehicle: { select: { sellerId: true, createdById: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Strict 2-party chat ownership: ONLY the buyer who initiated the chat or the vehicle listing seller/owner
    const isOwner =
      conversation.buyerId === user.id ||
      conversation.vehicle.sellerId === user.id ||
      conversation.vehicle.createdById === user.id;

    if (!isOwner) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const created = await db.message.create({
      data: { conversationId: conversation.id, senderId: user.id, body: parsed.data.body },
    });

    await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    const message: MessageDTO = {
      id: created.id,
      body: created.body,
      isMine: true,
      isSystem: created.isSystem,
      createdAt: created.createdAt.toISOString(),
    };

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("[api/conversations/[id]/messages] POST failed:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
