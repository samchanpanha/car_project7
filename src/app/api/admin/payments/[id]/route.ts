import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import {
  rejectPayment,
  toPaymentErrorResponse,
  verifyPaymentAndActivate,
} from "@/lib/api/payments";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["verify", "reject"]),
  reason: z.string().trim().min(3).max(300).optional(),
});

/**
 * Super Admin decision on a payment request.
 * verify → activates/extends the subscription (audited)
 * reject → records the rejection reason (audited); never activates anything
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Validation failed: ${first?.path.join(".") ?? "body"} — ${first?.message ?? "invalid"}` },
        { status: 400 },
      );
    }
    if (parsed.data.action === "reject" && !parsed.data.reason) {
      return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
    }

    const payment = await db.subscriptionPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (parsed.data.action === "verify") {
      const subscription = await verifyPaymentAndActivate(payment, admin.id);
      return NextResponse.json({ ok: true, subscription });
    }
    await rejectPayment(payment, admin.id, parsed.data.reason!);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toPaymentErrorResponse(err, "api/admin/payments/[id] PATCH");
  }
}
