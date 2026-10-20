import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDemoUser } from "@/lib/session";
import { toSellerSummary } from "@/lib/api/mappers";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getDemoUser();

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        vehicle: { include: { images: true, seller: { include: { sellerProfile: true } } } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    // 404 unless the demo buyer owns the conversation (avoids existence leaks).
    if (!conversation || conversation.buyerId !== user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages: MessageDTO[] = conversation.messages.map((m) => ({
      id: m.id,
      body: m.body,
      isMine: m.senderId === user.id,
      isSystem: m.isSystem,
      createdAt: m.createdAt.toISOString(),
    }));

    const images = [...conversation.vehicle.images].sort((a, b) => a.sortOrder - b.sortOrder);
    const dto: ConversationDetailDTO = {
      id: conversation.id,
      vehicle: {
        id: conversation.vehicle.id,
        make: conversation.vehicle.make,
        model: conversation.vehicle.model,
        year: conversation.vehicle.year,
        priceUsd: conversation.vehicle.priceUsd,
        thumbnail: images[0]?.url ?? null,
      },
      seller: toSellerSummary(conversation.vehicle.seller),
      messages,
    };

    return NextResponse.json({ conversation: dto });
  } catch (err) {
    console.error("[api/conversations/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}
