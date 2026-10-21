// KhLan commerce layer — subscription payments (Bakong KHQR / Manual KHQR)
// and buyer purchase requests. Extends (does not modify) dashboard-types.ts.

import type { PlanDTO } from "./dashboard-types";

// ---------- Subscription payments ----------

export type PaymentMethod = "BAKONG" | "MANUAL";

export type PaymentStatus =
  | "PENDING" // Bakong QR issued — waiting for the seller to transfer
  | "AWAITING_VERIFICATION" // needs Super Admin verification (manual submit or admin confirms Bakong)
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
  /** true when BAKONG_TOKEN is configured server-side */
  bakongConfigured: boolean;
  manual: {
    accountName: string | null;
    instructionsEn: string | null;
    instructionsKm: string | null;
    telegram: string | null;
    hasKhqr: boolean;
    /** data URL of the admin-configured KHQR payload (null → show fallback) */
    khqrDataUrl: string | null;
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
