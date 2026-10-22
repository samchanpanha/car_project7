import { db } from "@/lib/db";
import { HttpError, requireTenantMember } from "@/lib/api/guards";
import { refreshExpiredSubscription } from "@/lib/api/payments";

export function isProOrEnterprisePlan(plan?: string | null): boolean {
  if (!plan) return false;
  const p = plan.toUpperCase();
  return p === "PRO" || p === "ENTERPRISE";
}

/**
 * Validates whether the tenant may create a branch.
 * - PRO and ENTERPRISE plans: unlimited branches.
 * - FREE and BASIC plans: branches disabled (requires upgrade to PRO).
 */
export async function assertBranchCreationAllowed(tenantId: string) {
  const rawSub = await db.subscription.findUnique({ where: { tenantId } });
  const sub = await refreshExpiredSubscription(rawSub);
  const plan = sub?.status === "ACTIVE" ? sub.plan : "FREE";

  if (!isProOrEnterprisePlan(plan)) {
    throw new HttpError(
      403,
      "Showroom branches is an exclusive Pro & Enterprise feature. Please upgrade your subscription to Pro.",
    );
  }

  return { plan, allowed: true };
}
