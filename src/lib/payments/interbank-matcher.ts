// Interbank KHQR payment matching engine for Cambodian banks:
// Bridges payments originating from ACLEDA Bank, Wing, Canadia, Sathapana, etc.,
// to incoming ABA PayWay Telegram notifications.
//
// Context:
// When a customer pays an ABA KHQR code from ACLEDA Bank (or another bank):
// - The customer's ACLEDA slip displays an ACLEDA Reference No. (e.g. 62956359142)
//   or External Txn Ref (e.g. 6e0973e6).
// - ABA's incoming PayWay alert records:
//   "PayWay by ABA: ៛100 paid by Chanpanha Sam (*849) on Oct 22, 12:36 PM via ABA KHQR (ACLBKHPPXXX) at SAM CHAN PANHA. Trx. ID: 179264741214086, APV: 841951."
//
// This module cross-correlates bank BIC codes (e.g. ACLB -> ACLEDA), masked account numbers
// (e.g. *849), payer names, and amounts to find the exact matching ABA transaction.

import { db } from "@/lib/db";
import { phnomPenhDateKey, isCurrentDateInCambodia } from "./reference";

export {
  type BankMetadata,
  KNOWN_BANKS,
  getAllSupportedBanks,
  detectBankFromContext,
} from "./bank-directory";
import { detectBankFromContext, KNOWN_BANKS, type BankMetadata } from "./bank-directory";


export interface InterbankMatchParams {
  rawRef: string;
  amountExpected?: number;
  currencyExpected?: "USD" | "KHR";
  bankCodeHint?: string | null;
  payerNameHint?: string | null;
  payerAccountHint?: string | null;
  paidAtHint?: Date | null;
}

export interface InterbankMatchResult {
  matched: boolean;
  transaction: any | null;
  matchType:
    | "DIRECT_TRX_ID"
    | "DIRECT_APV"
    | "RAW_MESSAGE"
    | "INTERBANK_CORRELATION"
    | "NONE";
  originatingBank: BankMetadata | null;
  abaTrxId?: string;
  abaApv?: string | null;
  confidence: number;
  note?: string;
}

/**
 * Searches and cross-correlates an interbank transaction (from ACLEDA, Wing, etc.)
 * with records in the AbaTransaction table.
 */
export async function matchInterbankTransaction(
  params: InterbankMatchParams,
): Promise<InterbankMatchResult> {
  const trimmed = params.rawRef.trim();
  const detectedBank = detectBankFromContext({
    ref: trimmed,
    bankName: params.bankCodeHint,
  });

  // ---------- STRATEGY 1: DIRECT LOOKUP IN ABATRANSACTION ----------
  // Check if reference directly matches trxId, apv, or is embedded in rawMessage
  const direct = await db.abaTransaction.findFirst({
    where: {
      OR: [
        { trxId: trimmed },
        { apv: trimmed },
        { rawMessage: { contains: trimmed } },
      ],
    },
  });

  if (direct) {
    const isTrx = direct.trxId.toLowerCase() === trimmed.toLowerCase();
    const isApv = (direct.apv || "").toLowerCase() === trimmed.toLowerCase();
    return {
      matched: true,
      transaction: direct,
      matchType: isTrx ? "DIRECT_TRX_ID" : isApv ? "DIRECT_APV" : "RAW_MESSAGE",
      originatingBank: detectedBank || KNOWN_BANKS.ABA,
      abaTrxId: direct.trxId,
      abaApv: direct.apv,
      confidence: 100,
      note: `Direct bank match on ${isTrx ? "Trx ID" : isApv ? "APV" : "Message"}`,
    };
  }

  // ---------- STRATEGY 2: INTERBANK CORRELATION MATCH ----------
  // If user entered an ACLEDA Reference No. (e.g. 62956359142), search AbaTransaction
  // for recent interbank alerts from that sending bank matching amount and customer.

  // Fetch recent unmatched or underpaid transactions (take recent 30)
  const candidates = await db.abaTransaction.findMany({
    where: {
      status: { in: ["UNMATCHED", "UNDERPAID"] },
    },
    orderBy: { transactionDate: "desc" },
    take: 30,
  });

  if (candidates.length === 0) {
    return {
      matched: false,
      transaction: null,
      matchType: "NONE",
      originatingBank: detectedBank,
      confidence: 0,
    };
  }

  let bestCandidate: any = null;
  let highestScore = 0;
  let matchRationale = "";

  for (const c of candidates) {
    let score = 0;
    const reasons: string[] = [];

    // Date Guard: Automatic interbank correlation MUST match the calendar date in Cambodia!
    // Never correlate a today payment to a transaction from days ago.
    if (c.transactionDate) {
      if (params.paidAtHint) {
        if (phnomPenhDateKey(c.transactionDate) !== phnomPenhDateKey(params.paidAtHint)) {
          continue; // Discard candidate from a different date
        }
      } else {
        if (!isCurrentDateInCambodia(c.transactionDate)) {
          continue; // Discard candidate if not today
        }
      }
    }

    // A. Sending Bank Code match (e.g. ACLBKHPPXXX in ABA alert for ACLEDA)
    if (detectedBank && c.bankCode) {
      const bankCodeUpper = c.bankCode.toUpperCase();
      if (
        bankCodeUpper.includes(detectedBank.code) ||
        bankCodeUpper.includes(detectedBank.swiftPrefix)
      ) {
        score += 35;
        reasons.push(`Sending Bank (${detectedBank.name})`);
      }
    }

    // B. Account Number Mask match (e.g. customer slip *849 matches alert *849)
    if (params.payerAccountHint && c.payerAccount) {
      const hintDigits = params.payerAccountHint.replace(/\D/g, "");
      const candDigits = c.payerAccount.replace(/\D/g, "");
      if (hintDigits && candDigits && (hintDigits.endsWith(candDigits) || candDigits.endsWith(hintDigits))) {
        score += 35;
        reasons.push(`Account Mask (${c.payerAccount})`);
      }
    }

    // C. Payer Name fuzzy/exact match
    if (params.payerNameHint && c.payerName) {
      const cleanHint = params.payerNameHint.trim().toLowerCase().replace(/\s+/g, " ");
      const cleanCand = c.payerName.trim().toLowerCase().replace(/\s+/g, " ");
      if (cleanHint === cleanCand) {
        score += 30;
        reasons.push(`Payer Name (${c.payerName})`);
      } else if (cleanHint.includes(cleanCand) || cleanCand.includes(cleanHint)) {
        score += 20;
        reasons.push(`Payer Name Partial (${c.payerName})`);
      }
    }

    // D. Amount match (if expected amount provided)
    if (params.amountExpected != null && params.currencyExpected) {
      if (c.currency === params.currencyExpected) {
        const diff = Math.abs(c.amount - params.amountExpected);
        if (diff <= 1) {
          score += 25;
          reasons.push(`Amount (${c.currency} ${c.amount})`);
        }
      }
    }

    // E. Proximity of date (if receipt date hint provided)
    if (params.paidAtHint && c.transactionDate) {
      const timeDiffMinutes = Math.abs(params.paidAtHint.getTime() - c.transactionDate.getTime()) / (1000 * 60);
      if (timeDiffMinutes < 120) {
        score += 15;
        reasons.push(`Time Window (~${Math.round(timeDiffMinutes)}m)`);
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestCandidate = c;
      matchRationale = reasons.join(" + ");
    }
  }

  // Require a high confidence threshold (>= 60) for interbank correlation
  if (bestCandidate && highestScore >= 60) {
    return {
      matched: true,
      transaction: bestCandidate,
      matchType: "INTERBANK_CORRELATION",
      originatingBank: detectedBank || KNOWN_BANKS.ACLB,
      abaTrxId: bestCandidate.trxId,
      abaApv: bestCandidate.apv,
      confidence: Math.min(100, highestScore),
      note: `Matched interbank KHQR alert via ${matchRationale}`,
    };
  }

  return {
    matched: false,
    transaction: null,
    matchType: "NONE",
    originatingBank: detectedBank,
    confidence: highestScore,
  };
}
