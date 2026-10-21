import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import type { TenantLeadDTO } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic";

function firstImage(urls: { sortOrder: number; url: string }[]): string | null {
  if (urls.length === 0) return null;
  return [...urls].sort((a, b) => a.sortOrder - b.sortOrder)[0].url;
}

export async function GET() {
  try {
    const { user, tenant } = await requireTenantMember();

    const conversations = await db.conversation.findMany({
      where: { vehicle: { tenantId: tenant.id } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        vehicle: { include: { images: true } },
        buyer: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    const rows: TenantLeadDTO[] = conversations.map((c) => {
      const last = c.messages[0];
      const images = [...c.vehicle.images].sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        conversationId: c.id,
        vehicle: {
          id: c.vehicle.id,
          make: c.vehicle.make,
          model: c.vehicle.model,
          year: c.vehicle.year,
          priceUsd: c.vehicle.priceUsd,
          thumbnail: images[0]?.url ?? null,
        },
        buyer: { id: c.buyer.id, name: c.buyer.name },
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              isMine: last.senderId === user.id,
            }
          : null,
        messageCount: c._count.messages,
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(rows);
  } catch (err) {
    return toErrorResponse(err, "api/tenant/leads GET", "Failed to load tenant leads");
  }
}
