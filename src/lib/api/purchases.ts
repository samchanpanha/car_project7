// Purchase request workflow helpers.
// Status machine (auditable, backend-enforced):
//   buyer:  PENDING → CANCELLED (own request)
//   seller: PENDING → ACCEPTED | REJECTED ; ACCEPTED → COMPLETED | CANCELLED
//   COMPLETED marks the vehicle SOLD and cancels other open requests.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PurchaseRequest } from "@prisma/client";
import type { PurchaseRequestDTO } from "@/lib/commerce-types";

export function toPurchaseDTO(
  p: PurchaseRequest & {
    vehicle: { id: string; make: string; model: string; year: number; images: { url: string; sortOrder: number }[] };
    buyer?: { id: string; name: string } | null;
  },
  sellerName?: string,
): PurchaseRequestDTO {
  const images = [...p.vehicle.images].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: p.id,
    vehicle: {
      id: p.vehicle.id,
      make: p.vehicle.make,
      model: p.vehicle.model,
      year: p.vehicle.year,
      thumbnail: images[0]?.url ?? null,
    },
    buyer: p.buyer ? { id: p.buyer.id, name: p.buyer.name } : undefined,
    sellerName,
    status: p.status as PurchaseRequestDTO["status"],
    message: p.message,
    priceUsd: p.priceUsd,
    decidedAt: p.decidedAt?.toISOString() ?? null,
    decisionNote: p.decisionNote,
    createdAt: p.createdAt.toISOString(),
  };
}

const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  images: { select: { url: true, sortOrder: true } },
} as const;

export async function loadPurchaseForBuyer(id: string, buyerId: string) {
  return db.purchaseRequest.findFirst({
    where: { id, buyerId },
    include: { vehicle: { select: VEHICLE_SELECT } },
  });
}

export async function loadPurchaseForSellerSide(id: string) {
  return db.purchaseRequest.findUnique({
    where: { id },
    include: {
      vehicle: { select: { ...VEHICLE_SELECT, sellerId: true, tenantId: true } },
      buyer: { select: { id: true, name: true } },
    },
  });
}

/** Seller-side transition with state-machine + audit. Returns the updated row. */
export async function sellerTransition(
  purchase: PurchaseRequest,
  action: "accept" | "reject" | "complete" | "cancel",
  actorId: string,
): Promise<PurchaseRequest> {
  const now = new Date();
  const allowed: Record<string, string[]> = {
    accept: ["PENDING"],
    reject: ["PENDING"],
    complete: ["ACCEPTED"],
    cancel: ["PENDING", "ACCEPTED"],
  };
  if (!allowed[action].includes(purchase.status)) {
    const err = new Error(
      `Cannot ${action} a request that is ${purchase.status.toLowerCase()}`,
    ) as Error & { status: number };
    err.status = 409;
    throw err;
  }

  const nextStatus =
    action === "accept" ? "ACCEPTED"
    : action === "reject" ? "REJECTED"
    : action === "complete" ? "COMPLETED"
    : "CANCELLED";

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.purchaseRequest.update({
      where: { id: purchase.id },
      data: {
        status: nextStatus,
        decidedById: actorId,
        decidedAt: now,
      },
    });

    if (nextStatus === "COMPLETED") {
      // the vehicle is sold — keep listing data consistent, cancel other open requests
      await tx.vehicle.update({
        where: { id: purchase.vehicleId },
        data: { status: "SOLD" },
      });
      await tx.purchaseRequest.updateMany({
        where: {
          vehicleId: purchase.vehicleId,
          id: { not: purchase.id },
          status: { in: ["PENDING", "ACCEPTED"] },
        },
        data: {
          status: "CANCELLED",
          decidedAt: now,
          decisionNote: "Vehicle sold to another buyer",
        },
      });
    }
    return row;
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: `PURCHASE_${nextStatus}`,
      entity: "PurchaseRequest",
      entityId: purchase.id,
      metaJson: JSON.stringify({
        vehicleId: purchase.vehicleId,
        buyerId: purchase.buyerId,
        priceUsd: purchase.priceUsd,
      }),
    },
  });

  return updated;
}

export function purchaseErrorResponse(err: unknown, tag: string): NextResponse {
  const e = err as Error & { status?: number };
  if (e?.status && e.status !== 500) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(`[${tag}] failed:`, err);
  return NextResponse.json({ error: "Purchase request operation failed" }, { status: 500 });
}
