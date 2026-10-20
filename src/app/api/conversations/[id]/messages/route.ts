import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { SELLER_AUTO_REPLY } from "@/lib/api/messages";
import type { MessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const postMessageSchema = z.object({
  body: z.string().min(2, "body must be at least 2 characters"),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
        vehicle: { select: { sellerId: true, tenantId: true } },
        messages: { where: { isSystem: false }, select: { senderId: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Access: the conversation's buyer OR an ACTIVE member of the tenant that
    // owns the listed vehicle (dealer staff inbox). 404 otherwise.
    let allowed = conversation.buyerId === user.id;
    if (!allowed && conversation.vehicle.tenantId) {
      const membership = await db.tenantMember.findFirst({
        where: {
          userId: user.id,
          tenantId: conversation.vehicle.tenantId,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      allowed = !!membership;
    }
    if (!allowed) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const created = await db.message.create({
      data: { conversationId: conversation.id, senderId: user.id, body: parsed.data.body },
    });

    // Canned seller auto-reply fires only when the message sender is the buyer
    // (staff replies must not trigger it), and only while the seller has
    // replied fewer than 2 times (keeps the demo chat from looping).
    const sellerMessages = conversation.messages.filter(
      (m) => m.senderId === conversation.vehicle.sellerId,
    ).length;
    if (conversation.buyerId === user.id && sellerMessages < 2) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          senderId: conversation.vehicle.sellerId,
          body: SELLER_AUTO_REPLY,
        },
      });
    }

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
