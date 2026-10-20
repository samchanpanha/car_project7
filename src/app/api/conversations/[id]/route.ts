import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toSellerSummary } from "@/lib/api/mappers";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        vehicle: {
          select: { tenantId: true },
        },
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

    const full = await db.conversation.findUnique({
      where: { id },
      include: {
        vehicle: { include: { images: true, seller: { include: { sellerProfile: true } } } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!full) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages: MessageDTO[] = full.messages.map((m) => ({
      id: m.id,
      body: m.body,
      isMine: m.senderId === user.id,
      isSystem: m.isSystem,
      createdAt: m.createdAt.toISOString(),
    }));

    const images = [...full.vehicle.images].sort((a, b) => a.sortOrder - b.sortOrder);
    const dto: ConversationDetailDTO = {
      id: full.id,
      vehicle: {
        id: full.vehicle.id,
        make: full.vehicle.make,
        model: full.vehicle.model,
        year: full.vehicle.year,
        priceUsd: full.vehicle.priceUsd,
        thumbnail: images[0]?.url ?? null,
      },
      seller: toSellerSummary(full.vehicle.seller),
      messages,
    };

    return NextResponse.json({ conversation: dto });
  } catch (err) {
    console.error("[api/conversations/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}
