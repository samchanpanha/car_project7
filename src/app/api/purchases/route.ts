import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { purchaseErrorResponse } from "@/lib/api/purchases";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  vehicleId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});

/**
 * Buyer submits a purchase request.
 * A purchase request is NOT a payment — it only expresses intent to buy.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    rateLimit(`purchases:${user.id}`, 10, 60_000);

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }

    const vehicle = await db.vehicle.findUnique({ where: { id: parsed.data.vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }
    if (vehicle.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "This listing is not open for purchase requests" },
        { status: 409 },
      );
    }
    if (vehicle.sellerId === user.id) {
      return NextResponse.json({ error: "You cannot buy your own listing" }, { status: 400 });
    }

    const existing = await db.purchaseRequest.findFirst({
      where: {
        vehicleId: vehicle.id,
        buyerId: user.id,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `You already have an ${existing.status.toLowerCase()} request for this vehicle` },
        { status: 409 },
      );
    }

    const purchase = await db.purchaseRequest.create({
      data: {
        vehicleId: vehicle.id,
        buyerId: user.id,
        tenantId: vehicle.tenantId,
        sellerUserId: vehicle.sellerId,
        message: parsed.data.message ?? null,
        priceUsd: vehicle.priceUsd,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "PURCHASE_REQUESTED",
        entity: "PurchaseRequest",
        entityId: purchase.id,
        metaJson: JSON.stringify({
          vehicleId: vehicle.id,
          priceUsd: vehicle.priceUsd,
          tenantId: vehicle.tenantId,
        }),
      },
    });

    return NextResponse.json({ ok: true, id: purchase.id }, { status: 201 });
  } catch (err) {
    return purchaseErrorResponse(err, "api/purchases POST");
  }
}
