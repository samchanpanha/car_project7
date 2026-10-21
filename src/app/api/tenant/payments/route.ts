import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import {
  generatePaymentReference,
  monthsForCycle,
  priceForCycle,
  toPaymentErrorResponse,
} from "@/lib/api/payments";
import type { PlanKey } from "@/lib/api/plans";
import { generateKhqr, bakongConfigured } from "@/lib/bakong";
import { rateLimit } from "@/lib/rate-limit";
import type { SubscriptionPaymentDTO } from "@/lib/commerce-types";

export const dynamic = "force-dynamic";

function toDTO(
  p: {
    id: string; plan: string; billingCycle: string; amountUsd: number; months: number;
    method: string; status: string; reference: string; manualRef: string | null;
    evidenceUrl: string | null; note: string | null; rejectionReason: string | null; tenantId: string;
    reviewedAt: Date | null; createdAt: Date;
  },
  tenantName?: string,
): SubscriptionPaymentDTO {
  return {
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
    tenantName,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const { tenant } = await requireTenantMember();
    const rows = await db.subscriptionPayment.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(rows.map((r) => toDTO(r, tenant.name)));
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments GET", "Failed to load payments");
  }
}

const createSchema = z.object({
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  method: z.enum(["BAKONG", "MANUAL"]),
  manualRef: z.string().trim().min(4).max(80).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    const { user, member, tenant } = await requireTenantMember();
    if (!canManageTenant(member.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (tenant.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Tenant is suspended — subscriptions cannot be requested" },
        { status: 403 },
      );
    }
    rateLimit(`payments:${user.id}`, 10, 60_000);

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
    const { plan, billingCycle, method } = parsed.data;

    // one open request at a time prevents duplicate payments
    const open = await db.subscriptionPayment.findFirst({
      where: { tenantId: tenant.id, status: { in: ["PENDING", "AWAITING_VERIFICATION"] } },
    });
    if (open) {
      return NextResponse.json(
        { error: `You already have a ${open.status.replace(/_/g, " ").toLowerCase()} payment request (${open.reference})` },
        { status: 409 },
      );
    }

    const amountUsd = priceForCycle(plan as PlanKey, billingCycle);
    const months = monthsForCycle(billingCycle);
    const reference = generatePaymentReference();

    let qrPayload: string | null = null;
    let bakongMd5: string | null = null;
    let status = "AWAITING_VERIFICATION";

    if (method === "BAKONG") {
      if (!bakongConfigured()) {
        return NextResponse.json(
          { error: "Bakong KHQR is not configured on the platform — please use Manual KHQR payment" },
          { status: 503 },
        );
      }
      const qr = await generateKhqr({
        amountUsd,
        merchantName: tenant.name,
        billNumber: reference,
        storeLabel: "KhLan",
      });
      qrPayload = qr.qr;
      bakongMd5 = qr.md5;
      status = "PENDING";
    } else if (!parsed.data.manualRef) {
      return NextResponse.json(
        { error: "A bank transaction reference is required for manual payment" },
        { status: 400 },
      );
    }

    const payment = await db.subscriptionPayment.create({
      data: {
        tenantId: tenant.id,
        plan,
        billingCycle,
        amountUsd,
        months,
        method,
        status,
        reference,
        qrPayload,
        bakongMd5,
        manualRef: parsed.data.manualRef ?? null,
        note: parsed.data.note ?? null,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "PAYMENT_REQUESTED",
        entity: "SubscriptionPayment",
        entityId: payment.id,
        metaJson: JSON.stringify({ reference, method, plan, billingCycle, amountUsd }),
      },
    });

    return NextResponse.json(
      { payment: toDTO(payment, tenant.name), qrPayload, bakongMd5 },
      { status: 201 },
    );
  } catch (err) {
    return toPaymentErrorResponse(err, "api/tenant/payments POST");
  }
}
