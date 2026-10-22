import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const [verifiedPayments, pendingCount, subscriptions] = await Promise.all([
      db.subscriptionPayment.findMany({
        where: { status: "VERIFIED" },
        orderBy: { createdAt: "desc" },
      }),
      db.subscriptionPayment.count({
        where: { status: "AWAITING_VERIFICATION" },
      }),
      db.subscription.findMany({
        where: { status: "ACTIVE" },
      }),
    ]);

    // Total revenue
    const totalRevenue = verifiedPayments.reduce((sum, p) => sum + p.amountUsd, 0);

    // Revenue by cycle
    let monthlyRevenue = 0;
    let yearlyRevenue = 0;
    for (const p of verifiedPayments) {
      if (p.billingCycle === "YEARLY") {
        yearlyRevenue += p.amountUsd;
      } else {
        monthlyRevenue += p.amountUsd;
      }
    }

    // Subscriptions by plan
    const planCounts: Record<string, number> = {
      FREE: 0,
      BASIC: 0,
      PRO: 0,
      ENTERPRISE: 0,
    };
    for (const s of subscriptions) {
      planCounts[s.plan] = (planCounts[s.plan] || 0) + 1;
    }

    // Calculate Estimated MRR
    // Active monthly subscriptions contribute priceUsd
    // Active yearly subscriptions contribute priceUsd / 12
    const mrr = subscriptions.reduce((sum, s) => {
      if (s.plan === "FREE") return sum;
      if (s.billingCycle === "YEARLY") return sum + s.priceUsd / 12;
      return sum + s.priceUsd;
    }, 0);

    // Recent 10 verified payments
    const recent = verifiedPayments.slice(0, 10).map((p) => ({
      id: p.id,
      reference: p.reference,
      plan: p.plan,
      billingCycle: p.billingCycle,
      amountUsd: p.amountUsd,
      verifiedByName: p.verifiedByName,
      reviewedAt: p.reviewedAt,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({
      totalRevenue,
      monthlyRevenue,
      yearlyRevenue,
      estimatedMrr: Math.round(mrr * 100) / 100,
      activePaidSubscriptions: subscriptions.filter((s) => s.plan !== "FREE").length,
      pendingVerificationCount: pendingCount,
      planDistribution: planCounts,
      recentPayments: recent,
    });
  } catch (err) {
    return toErrorResponse(
      err,
      "api/admin/analytics/subscriptions GET",
      "Failed to calculate subscription analytics",
    );
  }
}
