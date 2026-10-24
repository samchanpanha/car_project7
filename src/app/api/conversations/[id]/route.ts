import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import { toSellerSummary } from "@/lib/api/mappers";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Login required to access messages" }, { status: 401 });
    }
    const { id } = await params;
    const user = await getCurrentUser();

    const conversation = await db.conversation.findUnique({
      where: { id },
      include: {
        vehicle: {
          select: { sellerId: true, createdById: true },
        },
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
      // 404 Not Found to prevent leaking the existence of conversations between other users
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const full = await db.conversation.findUnique({
      where: { id },
      include: {
        buyer: { select: { id: true, name: true, avatarUrl: true } },
        vehicle: { include: { images: true, seller: { include: { sellerProfile: true } } } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!full) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const isSeller =
      full.vehicle.sellerId === user.id || full.vehicle.createdById === user.id;
    const contactName = isSeller
      ? (full.buyer?.name || "Buyer")
      : (full.vehicle.seller.sellerProfile?.shopName || full.vehicle.seller.name || "Seller");

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
      buyer: full.buyer ? { id: full.buyer.id, name: full.buyer.name, avatarUrl: full.buyer.avatarUrl } : undefined,
      myRole: isSeller ? "SELLER" : "BUYER",
      contactName,
      messages,
    };

    return NextResponse.json({ conversation: dto });
  } catch (err) {
    console.error("[api/conversations/[id]] GET failed:", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}
