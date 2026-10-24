import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import { SAFETY_TIP_MESSAGE } from "@/lib/api/messages";
import type { ConversationListItemDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function firstImage(urls: { sortOrder: number; url: string }[]): string | null {
  if (urls.length === 0) return null;
  return [...urls].sort((a, b) => a.sortOrder - b.sortOrder)[0].url;
}

export async function GET() {
  try {
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Login required to access messages" }, { status: 401 });
    }
    const user = await getCurrentUser();

    // Strict 2-party chat ownership: only conversations where user is the buyer or vehicle seller/creator
    const conversations = await db.conversation.findMany({
      where: {
        OR: [
          { buyerId: user.id },
          { vehicle: { sellerId: user.id } },
          { vehicle: { createdById: user.id } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        buyer: { select: { id: true, name: true, avatarUrl: true } },
        vehicle: { include: { images: true, seller: { include: { sellerProfile: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const list: ConversationListItemDTO[] = conversations.map((c) => {
      const last = c.messages[0];
      const isSeller = c.vehicle.sellerId === user.id || c.vehicle.createdById === user.id;
      const role: "SELLER" | "BUYER" = isSeller ? "SELLER" : "BUYER";
      const otherName = isSeller
        ? (c.buyer?.name || "Buyer")
        : (c.vehicle.seller.sellerProfile?.shopName || c.vehicle.seller.name || "Seller");

      return {
        id: c.id,
        vehicle: {
          id: c.vehicle.id,
          make: c.vehicle.make,
          model: c.vehicle.model,
          year: c.vehicle.year,
          priceUsd: c.vehicle.priceUsd,
          thumbnail: firstImage(c.vehicle.images),
        },
        sellerName: otherName,
        contactName: otherName,
        role,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              isMine: last.senderId === user.id,
            }
          : null,
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({ conversations: list });
  } catch (err) {
    console.error("[api/conversations] GET failed:", err);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

const createConversationSchema = z.object({
  vehicleId: z.string().min(1),
  message: z.string().min(2, "message must be at least 2 characters"),
});

export async function POST(req: Request) {
  try {
    // Contacting a dealer is an account action — never attach to the
    // fallback demo buyer for fresh visitors.
    if (await isGuestRequest()) {
      return NextResponse.json({ error: "Login required to contact sellers" }, { status: 401 });
    }
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createConversationSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "vehicleId and message (min 2 chars) are required" }, { status: 400 });
    }

    const { vehicleId, message } = parsed.data;
    const user = await getCurrentUser();

    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    if (vehicle.sellerId === user.id || vehicle.createdById === user.id) {
      return NextResponse.json(
        { error: "You cannot message yourself about your own vehicle listing" },
        { status: 400 },
      );
    }

    let conversation = await db.conversation.findFirst({
      where: { buyerId: user.id, vehicleId },
    });

    if (!conversation) {
      conversation = await db.conversation.create({
        data: { vehicleId, buyerId: user.id },
      });
      await db.message.create({
        data: { conversationId: conversation.id, body: SAFETY_TIP_MESSAGE, isSystem: true },
      });
    }

    await db.message.create({
      data: { conversationId: conversation.id, senderId: user.id, body: message },
    });

    return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
  } catch (err) {
    console.error("[api/conversations] POST failed:", err);
    return NextResponse.json({ error: "Failed to start conversation" }, { status: 500 });
  }
}
