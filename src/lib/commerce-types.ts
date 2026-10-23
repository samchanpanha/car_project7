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
  currency?: "USD" | "KHR";
  amountExpected?: number | null;
  months: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  manualRef?: string | null;
  evidenceUrl?: string | null;
  /** uploaded payment screenshot (data URL) — included for admins / the owner's own submission */
  evidenceImage?: string | null;
  /** list views omit the heavy image and flag its presence instead */
  hasEvidenceImage?: boolean;
  /** OCR analysis of the uploaded receipt */
  ocrStatus?: string | null; // PASS | WARN | MISMATCH | UNREADABLE | NOT_RUN
  ocrConfidence?: number | null;
  ocrRef?: string | null;
  ocrAmount?: number | null;
  ocrCurrency?: string | null;
  ocrPaidAt?: string | null;
  riskFlags?: string[];
  /** Telegram bot delivery outcome for this submission */
  telegramSentAt?: string | null;
  telegramError?: string | null;
  note?: string | null;
  rejectionReason?: string | null;
  tenantId: string;
  tenantName?: string;
  reviewedAt?: string | null;
  verifiedByName?: string | null;
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
    /** uploaded QR image (data URL) — takes display precedence over khqrDataUrl */
    khqrImage: string | null;
    /** Per-cycle KHQR images — different QR codes for monthly vs yearly billing */
    khqrImageMonthly: string | null;
    khqrImageYearly: string | null;
    /** Per-currency KHQR images — dedicated QR codes for USD vs KHR payments */
    khqrImageUsd: string | null;
    khqrImageKhr: string | null;
    /** KHR exchange rate per USD (default 4100) */
    khrExchangeRate: number;
    skipMerchantCheck?: boolean;
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
