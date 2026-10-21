import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageTenant, requireTenantMember, toErrorResponse } from "@/lib/api/guards";
import {
  generatePaymentReference,
  getManualPaymentConfig,
  monthsForCycle,
  priceForCycle,
  toPaymentErrorResponse,
} from "@/lib/api/payments";
import type { PlanKey } from "@/lib/api/plans";
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
  manualRef: z.string().trim().min(4).max(80),
  evidenceUrl: z.string().trim().url().max(500).optional(),
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

    // master switch — the Super Admin can disable new subscription payments
    const config = await getManualPaymentConfig();
    if (!config.enabled) {
      return NextResponse.json(
        { error: "Subscription payments are currently disabled by the platform administrator" },
        { status: 403 },
      );
    }

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
    const { plan, billingCycle, manualRef } = parsed.data;

    // one open request at a time prevents duplicate payments
    const open = await db.subscriptionPayment.findFirst({
      where: { tenantId: tenant.id, status: "AWAITING_VERIFICATION" },
    });
    if (open) {
      return NextResponse.json(
        { error: `You already have a payment request awaiting verification (${open.reference})` },
        { status: 409 },
      );
    }

    const amountUsd = priceForCycle(plan as PlanKey, billingCycle);
    const months = monthsForCycle(billingCycle);
    const reference = generatePaymentReference();

    const payment = await db.subscriptionPayment.create({
      data: {
        tenantId: tenant.id,
        plan,
        billingCycle,
        amountUsd,
        months,
        method: "MANUAL",
        status: "AWAITING_VERIFICATION",
        reference,
        manualRef,
        evidenceUrl: parsed.data.evidenceUrl ?? null,
        note: parsed.data.note ?? null,
      },
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "PAYMENT_REQUESTED",
        entity: "SubscriptionPayment",
        entityId: payment.id,
        metaJson: JSON.stringify({ reference, method: "MANUAL", plan, billingCycle, amountUsd, manualRef }),
      },
    });

    return NextResponse.json(
      { payment: toDTO(payment, tenant.name) },
      { status: 201 },
    );
  } catch (err) {
    return toPaymentErrorResponse(err, "api/tenant/payments POST");
  }
}
