import { NextRequest, NextResponse } from "next/server";
import { getVehicleDetailPayload } from "@/lib/api/vehicle-detail";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing vehicle ID" }, { status: 400 });
    }

    const payload = await getVehicleDetailPayload(id);

    if (!payload) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("[VehicleDetailAPI] Error fetching vehicle detail:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch vehicle detail" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const vehicle = await db.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
    const isOwner = vehicle.sellerId === user.id || vehicle.createdById === user.id;
    let isTenantMember = false;
    if (vehicle.tenantId) {
      const membership = await db.tenantMember.findFirst({
        where: { tenantId: vehicle.tenantId, userId: user.id, status: "ACTIVE" },
      });
      if (membership) isTenantMember = true;
    }

    if (!isAdmin && !isOwner && !isTenantMember) {
      return NextResponse.json({ error: "Forbidden: Not authorized to modify this listing" }, { status: 403 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.status && ["PUBLISHED", "DRAFT", "PENDING", "SOLD", "ARCHIVED"].includes(body.status)) {
      data.status = body.status;
    }
    if (typeof body.priceUsd === "number" && body.priceUsd > 0) {
      data.priceUsd = body.priceUsd;
    }
    if (typeof body.featured === "boolean") {
      data.featured = body.featured;
    }

    const updated = await db.vehicle.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, vehicle: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to update vehicle" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const vehicle = await db.vehicle.findUnique({ where: { id } });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
    const isOwner = vehicle.sellerId === user.id || vehicle.createdById === user.id;
    let isTenantMember = false;
    if (vehicle.tenantId) {
      const membership = await db.tenantMember.findFirst({
        where: { tenantId: vehicle.tenantId, userId: user.id, status: "ACTIVE" },
      });
      if (membership && (membership.role === "OWNER" || membership.role === "MANAGER")) {
        isTenantMember = true;
      }
    }

    if (!isAdmin && !isOwner && !isTenantMember) {
      return NextResponse.json({ error: "Forbidden: Not authorized to delete this listing" }, { status: 403 });
    }

    // Soft-delete: set status to ARCHIVED
    const updated = await db.vehicle.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    return NextResponse.json({ ok: true, message: "Listing deleted successfully", vehicle: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to delete vehicle" }, { status: 500 });
  }
}
