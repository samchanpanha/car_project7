import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import type { SubscriptionPaymentDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

/** Admin verification queue — filter by status, e.g. ?status=AWAITING_VERIFICATION */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const rows = await db.subscriptionPayment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { tenant: { select: { name: true } } },
    });

    const items: SubscriptionPaymentDTO[] = rows.map((p) => ({
      id: p.id,
      plan: p.plan as SubscriptionPaymentDTO["plan"],
      billingCycle: p.billingCycle as "MONTHLY" | "YEARLY",
      amountUsd: p.amountUsd,
      months: p.months,
      method: p.method as SubscriptionPaymentDTO["method"],
      status: p.status as SubscriptionPaymentDTO["status"],
      reference: p.reference,
      manualRef: p.manualRef,
      evidenceUrl: p.evidenceUrl,
      note: p.note,
      rejectionReason: p.rejectionReason,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
    return NextResponse.json(items);
  } catch (err) {
    return toErrorResponse(err, "api/admin/payments GET", "Failed to load payments");
  }
}
