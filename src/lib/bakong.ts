// Bakong (National Bank of Cambodia) KHQR client.
//
// Official developer API: https://api-bakong.nbc.gov.kh/document
//   POST {base}/api/generate-qr               → { qrCode, md5 }
//   POST {base}/api/check_transaction_by_md5  → { responseCode, hash? }
//
// Environment configuration (never hardcode credentials):
//   BAKONG_TOKEN       — developer API token issued from the Bakong portal
//   BAKONG_ACCOUNT_ID  — merchant Bakong account id, e.g. "merchant@aclb"
//   BAKONG_BASE_URL    — optional override (default official production host)
//
// NOTE: without BAKONG_TOKEN the platform clearly reports Bakong as
// "not configured" and sellers fall back to the Manual KHQR flow. Payment
// status is NEVER trusted from the client — verification always happens
// server-side by calling check_transaction_by_md5.

const BASE_URL = process.env.BAKONG_BASE_URL || "https://api-bakong.nbc.gov.kh";
const TOKEN = process.env.BAKONG_TOKEN || "";
const ACCOUNT_ID = process.env.BAKONG_ACCOUNT_ID || "";

export function bakongConfigured(): boolean {
  return Boolean(TOKEN);
}

async function bakongPost(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        (json.responseMessage as string) || `Bakong API error (${res.status})`,
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export interface GeneratedKhqr {
  qr: string;
  md5: string;
}

/**
 * Request a KHQR payload for a subscription payment.
 * Uses the official generate-qr endpoint. `billNumber` carries our payment
 * reference so the transfer can be reconciled with the SubscriptionPayment row.
 */
export async function generateKhqr(input: {
  amountUsd: number;
  merchantName: string;
  billNumber: string;
  storeLabel?: string;
}): Promise<GeneratedKhqr> {
  if (!bakongConfigured()) {
    throw new Error("Bakong API is not configured (missing BAKONG_TOKEN)");
  }

  const body: Record<string, unknown> = {
    currency: "USD",
    amount: Math.round(input.amountUsd * 100) / 100,
    merchantName: input.merchantName.slice(0, 25),
    city: "Phnom Penh",
    merchantCategoryCode: "5999",
    languagePreference: "EN",
    billNumber: input.billNumber.slice(0, 25),
    storeLabel: (input.storeLabel || "KhLan").slice(0, 25),
    terminalLabel: "KhLan Web",
  };
  if (ACCOUNT_ID) body.accountDetails = { accountId: ACCOUNT_ID };

  const json = await bakongPost("/api/generate-qr", body);
  // The API wraps the payload either at top level or under `data` — accept both.
  const data = (json.data as Record<string, unknown> | undefined) ?? json;
  const qr = (data.qrCode ?? data.qr) as string | undefined;
  const md5 = data.md5 as string | undefined;
  if (!qr || !md5) {
    throw new Error(
      (json.responseMessage as string) || "Bakong generate-qr returned no QR payload",
    );
  }
  return { qr, md5 };
}

export interface BakongCheckResult {
  /** true when Bakong reports a completed incoming transaction for this QR */
  paid: boolean;
  hash?: string;
  raw: Record<string, unknown>;
}

/**
 * Check a payment by the md5 returned from generate-qr.
 * A transaction is considered paid when the API returns a transaction hash.
 */
export async function checkTransactionByMd5(md5: string): Promise<BakongCheckResult> {
  if (!bakongConfigured()) {
    throw new Error("Bakong API is not configured (missing BAKONG_TOKEN)");
  }
  const json = await bakongPost("/api/check_transaction_by_md5", { md5 });
  const data = (json.data as Record<string, unknown> | undefined) ?? json;
  const hash = (data.hash ?? data.transactionHash) as string | undefined;
  const paid = Boolean(hash) && String(json.responseCode ?? "0") === "0";
  return { paid, hash, raw: json };
}
