import type { PlanDTO, SubscriptionDTO } from "@/lib/dashboard-types";
import type { Subscription } from "@prisma/client";

export type PlanKey = PlanDTO["plan"];

/** Canonical plan catalog — prices/limits/seats in USD. */
export const PLAN_CATALOG: PlanDTO[] = [
  {
    plan: "FREE",
    name: "Free",
    priceUsdMonthly: 0,
    priceUsdYearly: 0,
    listingsLimit: 3,
    featuredLimit: 0,
    seats: 1,
    canSellSpareParts: false,
    features: [
      { en: "Up to 3 active listings", km: "ឡាន/ម៉ូតូដាក់លក់សកម្មបាន ៣" },
      { en: "Sell Cars & Motorcycles", km: "ដាក់លក់ឡាន និងម៉ូតូ" },
      { en: "Standard listing page", km: "ទំព័របង្ហាញស្តង់ដារ" },
      { en: "1 team seat", km: "កៅអីសមាជិក ១" },
    ],
  },
  {
    plan: "BASIC",
    name: "Basic",
    priceUsdMonthly: 49,
    priceUsdYearly: 490,
    listingsLimit: 15,
    featuredLimit: 3,
    seats: 3,
    canSellSpareParts: false,
    features: [
      { en: "Up to 15 active listings", km: "ឡាន/ម៉ូតូដាក់លក់សកម្មបាន ១៥" },
      { en: "Sell Cars & Motorcycles", km: "ដាក់លក់ឡាន និងម៉ូតូ" },
      { en: "3 featured slots", km: "កន្លែងបង្ហាញពិសេស ៣" },
      { en: "3 team seats", km: "កៅអីសមាជិក ៣" },
      { en: "Lead inbox with buyer chat", km: "ប្រអប់សារពីអតិថិជន" },
    ],
  },
  {
    plan: "PRO",
    name: "Pro",
    priceUsdMonthly: 149,
    priceUsdYearly: 1490,
    listingsLimit: 50,
    featuredLimit: 10,
    seats: 8,
    canSellSpareParts: true,
    features: [
      { en: "Up to 50 active listings", km: "ដាក់លក់សកម្មបាន ៥០" },
      { en: "Sell Cars, Motors & Spare Parts", km: "ដាក់លក់ឡាន ម៉ូតូ និងគ្រឿងបន្លាស់" },
      { en: "10 featured slots", km: "កន្លែងបង្ហាញពិសេស ១០" },
      { en: "8 team seats", km: "កៅអីសមាជិក ៨" },
      { en: "AI history reports & priority support", km: "របាយការណ៍ AI និងជំនួយប្រកបដោយអាទិភាព" },
    ],
  },
  {
    plan: "ENTERPRISE",
    name: "Enterprise",
    priceUsdMonthly: 399,
    priceUsdYearly: 3990,
    listingsLimit: 200,
    featuredLimit: 40,
    seats: 25,
    canSellSpareParts: true,
    features: [
      { en: "Up to 200 active listings", km: "ដាក់លក់សកម្មបាន ២០០" },
      { en: "Sell Cars, Motors & Spare Parts (Car & Motor)", km: "ដាក់លក់ឡាន ម៉ូតូ និងគ្រឿងបន្លាស់គ្រប់ប្រភេទ" },
      { en: "40 featured slots", km: "កន្លែងបង្ហាញពិសេស ៤០" },
      { en: "25 team seats", km: "កៅអីសមាជិក ២៥" },
      { en: "Dedicated account manager & API access", km: "អ្នកគ្រប់គ្រងគណនីផ្ទាល់ខ្លួន និងការប្រើ API" },
    ],
  },
];

export const PLAN_BY_KEY: Record<PlanKey, PlanDTO> = Object.fromEntries(
  PLAN_CATALOG.map((p) => [p.plan, p]),
) as Record<PlanKey, PlanDTO>;

/** Normalize a subscription price to its monthly equivalent (unrounded). */
export function normalizedMonthlyPrice(priceUsd: number, billingCycle: string): number {
  return billingCycle === "YEARLY" ? priceUsd / 12 : priceUsd;
}

/** Map a Subscription row to the shared SubscriptionDTO. */
export function toSubscriptionDTO(sub: Subscription): SubscriptionDTO {
  const catalogRow = PLAN_BY_KEY[sub.plan as PlanKey];
  return {
    id: sub.id,
    plan: sub.plan as SubscriptionDTO["plan"],
    status: sub.status as SubscriptionDTO["status"],
    billingCycle: sub.billingCycle as SubscriptionDTO["billingCycle"],
    priceUsd: sub.priceUsd,
    listingsLimit: sub.listingsLimit,
    featuredLimit: sub.featuredLimit,
    seats: sub.seats,
    canSellSpareParts: catalogRow?.canSellSpareParts ?? (sub.plan === "PRO" || sub.plan === "ENTERPRISE"),
    startedAt: sub.startedAt.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
  };
}
