import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isGuestRequest } from "@/lib/session";
import { SAFETY_TIP_MESSAGE, SELLER_AUTO_REPLY } from "@/lib/api/messages";
import type { ConversationListItemDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

function firstImage(urls: { sortOrder: number; url: string }[]): string | null {
  if (urls.length === 0) return null;
  return [...urls].sort((a, b) => a.sortOrder - b.sortOrder)[0].url;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const conversations = await db.conversation.findMany({
      where: { buyerId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        vehicle: { include: { images: true, seller: { include: { sellerProfile: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const list: ConversationListItemDTO[] = conversations.map((c) => {
      const last = c.messages[0];
      const seller = c.vehicle.seller;
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
        sellerName: seller.sellerProfile?.shopName || seller.name,
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

    // One canned seller auto-reply from the vehicle's seller user.
    await db.message.create({
      data: { conversationId: conversation.id, senderId: vehicle.sellerId, body: SELLER_AUTO_REPLY },
    });

    return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
  } catch (err) {
    console.error("[api/conversations] POST failed:", err);
    return NextResponse.json({ error: "Failed to start conversation" }, { status: 500 });
  }
}
