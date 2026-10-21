// KhLan commerce layer — subscription payments (Manual KHQR only) and
// buyer purchase requests. Extends (does not modify) dashboard-types.ts.

import type { PlanDTO } from "./dashboard-types";

// ---------- Subscription payments (manual KHQR only) ----------

export type PaymentMethod = "MANUAL";

export type PaymentStatus =
  | "AWAITING_VERIFICATION" // seller submitted the bank reference — needs Super Admin verification
  | "VERIFIED"
  | "REJECTED"
  | "CANCELLED";

export interface SubscriptionPaymentDTO {
  id: string;
  plan: Exclude<PlanDTO["plan"], "FREE">;
  billingCycle: "MONTHLY" | "YEARLY";
  amountUsd: number;
  months: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  manualRef?: string | null;
  evidenceUrl?: string | null;
  note?: string | null;
  rejectionReason?: string | null;
  tenantId: string;
  tenantName?: string;
  reviewedAt?: string | null;
  createdAt: string;
}

/** GET /api/tenant/payments/config — what the seller can use to pay. */
export interface PaymentConfigDTO {
  /** master switch — when false the admin has disabled new subscription payments */
  enabled: boolean;
  manual: {
    accountName: string | null;
    instructionsEn: string | null;
    instructionsKm: string | null;
    telegram: string | null;
    hasKhqr: boolean;
    /** data URL of the admin-configured KHQR payload (null → show fallback) */
    khqrDataUrl: string | null;
  };
  /** admin-configured FREE tier */
  freePlan: {
    enabled: boolean;
    listingsLimit: number;
    featuredLimit: number;
    seats: number;
  };
}

// ---------- Purchase requests ----------

export type PurchaseStatus = "PENDING" | "ACCEPTED" | "COMPLETED" | "CANCELLED" | "REJECTED";

export interface PurchaseRequestDTO {
  id: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    thumbnail?: string | null;
  };
  /** buyer info — present for seller-facing lists */
  buyer?: { id: string; name: string };
  /** seller/shop name — present for buyer-facing lists */
  sellerName?: string;
  status: PurchaseStatus;
  message?: string | null;
  /** vehicle price at the time of the request */
  priceUsd: number;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
}
