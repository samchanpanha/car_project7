import { describe, it, expect } from "vitest";

describe("Seller Subscription & Listing Gatekeeper Guards", () => {
  interface SellerSubscriptionStatus {
    plan: "FREE_TRIAL" | "PRO" | "DEALER" | "ENTERPRISE";
    status: "ACTIVE" | "EXPIRED" | "PENDING_REVIEW";
    trialDaysRemaining: number;
    canListVehicles: boolean;
  }

  function computeSellerListingEligibility(params: {
    createdAt: Date;
    activeSubscription?: {
      status: string;
      expiresAt: Date;
    } | null;
    pendingReview?: boolean;
    now?: Date;
  }): SellerSubscriptionStatus {
    const now = params.now || new Date();
    const TRIAL_DAYS = 14;
    const diffMs = now.getTime() - params.createdAt.getTime();
    const daysSinceRegistration = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const trialDaysRemaining = Math.max(0, TRIAL_DAYS - daysSinceRegistration);

    if (params.activeSubscription && params.activeSubscription.status === "ACTIVE" && params.activeSubscription.expiresAt > now) {
      return {
        plan: "PRO",
        status: "ACTIVE",
        trialDaysRemaining,
        canListVehicles: true,
      };
    }

    if (trialDaysRemaining > 0) {
      return {
        plan: "FREE_TRIAL",
        status: "ACTIVE",
        trialDaysRemaining,
        canListVehicles: true,
      };
    }

    if (params.pendingReview) {
      return {
        plan: "PRO",
        status: "PENDING_REVIEW",
        trialDaysRemaining: 0,
        canListVehicles: false,
      };
    }

    return {
      plan: "FREE_TRIAL",
      status: "EXPIRED",
      trialDaysRemaining: 0,
      canListVehicles: false,
    };
  }

  it("should grant listing access to new sellers within the 14-day free trial", () => {
    const recentDate = new Date();
    const result = computeSellerListingEligibility({ createdAt: recentDate });

    expect(result.canListVehicles).toBe(true);
    expect(result.status).toBe("ACTIVE");
    expect(result.trialDaysRemaining).toBe(14);
  });

  it("should block sellers after the 14-day trial without active paid subscription", () => {
    const expiredDate = new Date(Date.now() - 20 * 24 * 3600 * 1000); // 20 days ago
    const result = computeSellerListingEligibility({ createdAt: expiredDate });

    expect(result.canListVehicles).toBe(false);
    expect(result.status).toBe("EXPIRED");
    expect(result.trialDaysRemaining).toBe(0);
  });

  it("should unlock seller listing capabilities when active PRO subscription is present", () => {
    const expiredDate = new Date(Date.now() - 30 * 24 * 3600 * 1000); // 30 days ago
    const activeSub = {
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30 days in future
    };

    const result = computeSellerListingEligibility({
      createdAt: expiredDate,
      activeSubscription: activeSub,
    });

    expect(result.canListVehicles).toBe(true);
    expect(result.status).toBe("ACTIVE");
    expect(result.plan).toBe("PRO");
  });

  it("should hold in PENDING_REVIEW state when slip is submitted for manual admin date verification", () => {
    const expiredDate = new Date(Date.now() - 20 * 24 * 3600 * 1000);
    const result = computeSellerListingEligibility({
      createdAt: expiredDate,
      pendingReview: true,
    });

    expect(result.status).toBe("PENDING_REVIEW");
    expect(result.canListVehicles).toBe(false);
  });
});
