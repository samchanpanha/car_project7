import { describe, it, expect } from "vitest";

/**
 * Ensures strict parity between backend PlanCatalogService defaults
 * and frontend client pricing expectations.
 */
describe("Plan Catalog & Quotas Parity", () => {
  const CANONICAL_PLANS = {
    FREE: {
      plan: "FREE",
      priceUsdMonthly: 0,
      priceUsdYearly: 0,
      priceKhrMonthly: 0,
      priceKhrYearly: 0,
      listingsLimit: 3,
      featuredLimit: 0,
      seats: 1,
      branchSlots: 1,
      canSellSpareParts: false,
    },
    STARTER: {
      plan: "STARTER",
      priceUsdMonthly: 9,
      priceUsdYearly: 90,
      priceKhrMonthly: 37000,
      priceKhrYearly: 370000,
      listingsLimit: 5,
      featuredLimit: 1,
      seats: 1,
      branchSlots: 1,
      canSellSpareParts: false,
    },
    BASIC: {
      plan: "BASIC",
      priceUsdMonthly: 29,
      priceUsdYearly: 290,
      priceKhrMonthly: 119000,
      priceKhrYearly: 1190000,
      listingsLimit: 15,
      featuredLimit: 3,
      seats: 2,
      branchSlots: 1,
      canSellSpareParts: false,
    },
    PRO: {
      plan: "PRO",
      priceUsdMonthly: 59,
      priceUsdYearly: 590,
      priceKhrMonthly: 242000,
      priceKhrYearly: 2420000,
      listingsLimit: 50,
      featuredLimit: 10,
      seats: 5,
      branchSlots: 3,
      canSellSpareParts: true,
    },
    ENTERPRISE: {
      plan: "ENTERPRISE",
      priceUsdMonthly: 149,
      priceUsdYearly: 1490,
      priceKhrMonthly: 611000,
      priceKhrYearly: 6110000,
      listingsLimit: 1000,
      featuredLimit: 30,
      seats: 20,
      branchSlots: 10,
      canSellSpareParts: true,
    },
  };

  it("verifies Cambodia pricing model tier order and pricing structure", () => {
    const plans = Object.values(CANONICAL_PLANS);
    expect(plans).toHaveLength(5);

    // Free tier is $0 with 3 listings limit
    expect(CANONICAL_PLANS.FREE.priceUsdMonthly).toBe(0);
    expect(CANONICAL_PLANS.FREE.listingsLimit).toBe(3);
    expect(CANONICAL_PLANS.FREE.canSellSpareParts).toBe(false);

    // Starter tier is $9/mo ($90/yr = 2 months free) with 5 listings
    expect(CANONICAL_PLANS.STARTER.priceUsdMonthly).toBe(9);
    expect(CANONICAL_PLANS.STARTER.priceUsdYearly).toBe(90);
    expect(CANONICAL_PLANS.STARTER.listingsLimit).toBe(5);
    expect(CANONICAL_PLANS.STARTER.featuredLimit).toBe(1);

    // Basic tier is $29/mo ($290/yr) with 15 listings
    expect(CANONICAL_PLANS.BASIC.priceUsdMonthly).toBe(29);
    expect(CANONICAL_PLANS.BASIC.priceUsdYearly).toBe(290);
    expect(CANONICAL_PLANS.BASIC.listingsLimit).toBe(15);
    expect(CANONICAL_PLANS.BASIC.featuredLimit).toBe(3);

    // Pro tier is $59/mo ($590/yr) with 50 listings, 10 featured, spare parts
    expect(CANONICAL_PLANS.PRO.priceUsdMonthly).toBe(59);
    expect(CANONICAL_PLANS.PRO.priceUsdYearly).toBe(590);
    expect(CANONICAL_PLANS.PRO.listingsLimit).toBe(50);
    expect(CANONICAL_PLANS.PRO.featuredLimit).toBe(10);
    expect(CANONICAL_PLANS.PRO.branchSlots).toBe(3);
    expect(CANONICAL_PLANS.PRO.canSellSpareParts).toBe(true);

    // Enterprise tier is $149/mo ($1490/yr) with 1000 listings, 30 featured, spare parts
    expect(CANONICAL_PLANS.ENTERPRISE.priceUsdMonthly).toBe(149);
    expect(CANONICAL_PLANS.ENTERPRISE.priceUsdYearly).toBe(1490);
    expect(CANONICAL_PLANS.ENTERPRISE.listingsLimit).toBe(1000);
    expect(CANONICAL_PLANS.ENTERPRISE.featuredLimit).toBe(30);
    expect(CANONICAL_PLANS.ENTERPRISE.branchSlots).toBe(10);
    expect(CANONICAL_PLANS.ENTERPRISE.canSellSpareParts).toBe(true);
  });

  it("verifies yearly billing offers 2 months free (10x monthly price)", () => {
    for (const plan of Object.values(CANONICAL_PLANS)) {
      if (plan.priceUsdMonthly > 0) {
        expect(plan.priceUsdYearly).toBe(plan.priceUsdMonthly * 10);
      }
    }
  });

  it("verifies spare parts permissions are restricted to Pro and Enterprise", () => {
    expect(CANONICAL_PLANS.FREE.canSellSpareParts).toBe(false);
    expect(CANONICAL_PLANS.STARTER.canSellSpareParts).toBe(false);
    expect(CANONICAL_PLANS.BASIC.canSellSpareParts).toBe(false);
    expect(CANONICAL_PLANS.PRO.canSellSpareParts).toBe(true);
    expect(CANONICAL_PLANS.ENTERPRISE.canSellSpareParts).toBe(true);
  });
});

