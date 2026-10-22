// ABA PayWay / Bank Telegram notification parser.
// Parses automated payment alerts posted by ABA PayWay / Bakong into the Telegram group.
// Example:
// "PayWay by ABA: ៛200 paid by Sam Chanpanha (*674) on Oct 22, 01:05 PM via ABA KHQR (AMRTKHPPXXX) at SAM CHAN PANHA. Trx. ID: 179264913984347, APV: 135160."

export interface ParsedAbaTransaction {
  rawMessage: string;
  source: string;
  trxId: string;
  apv: string | null;
  amount: number;
  currency: "KHR" | "USD";
  amountUsd: number;
  payerName: string | null;
  payerAccount: string | null;
  bankCode: string | null;
  merchantName: string | null;
  transactionDateRaw: string | null;
  transactionDate: Date;
}

const KHR_TO_USD_RATE = 4100;

/**
 * Returns true if the message is identified as an ABA PayWay / KHQR alert.
 */
export function isAbaPayWayMessage(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("payway by aba") ||
    lower.includes("payway") ||
    lower.includes("aba khqr") ||
    (lower.includes("trx") && lower.includes("apv")) ||
    (lower.includes("trx") && lower.includes("paid by")) ||
    ((lower.includes("trx. id") || lower.includes("trx id") || lower.includes("transaction id")) &&
      (lower.includes("paid by") || lower.includes("៛") || lower.includes("$") || lower.includes("khr") || lower.includes("usd")))
  );
}

/**
 * Parses raw text of an ABA PayWay notification message into structured fields.
 */
export function parseAbaPayWayMessage(
  rawText: string,
  fallbackDate: Date = new Date(),
): ParsedAbaTransaction | null {
  if (!rawText) return null;
  // Strip bot mention and /aba or /payway prefix if present
  let text = rawText.trim();
  text = text.replace(/^\/(?:aba|payway)(?:@\w+)?\s+/i, "");
  text = text.replace(/^@\w+\s+/i, "");

  // 1. Transaction ID (required to uniquely identify the transaction)
  const trxMatch = /(?:Trx\.?\s*ID|Transaction\s*ID|Txn\s*ID|TrxID|Trx)\b[:\s]*([A-Za-z0-9_-]+)/i.exec(text);
  if (!trxMatch) return null;
  const trxId = trxMatch[1].trim();

  // 2. APV (Approval code)
  const apvMatch = /APV\b[:\s]*([A-Za-z0-9_-]+)/i.exec(text);
  const apv = apvMatch ? apvMatch[1].trim() : null;

  // 3. Amount and Currency
  let amount = 0;
  let currency: "KHR" | "USD" = "USD";

  // Check Khmer Riel (៛ or KHR)
  const khrMatch = /(?:៛|KHR)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:៛|KHR)/i.exec(text);
  // Check USD ($ or USD)
  const usdMatch = /(?:\$|USD)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:\$|USD)/i.exec(text);

  if (khrMatch) {
    const rawNum = (khrMatch[1] || khrMatch[2] || "").replace(/,/g, "");
    amount = parseFloat(rawNum) || 0;
    currency = "KHR";
  } else if (usdMatch) {
    const rawNum = (usdMatch[1] || usdMatch[2] || "").replace(/,/g, "");
    amount = parseFloat(rawNum) || 0;
    currency = "USD";
  }

  const amountUsd =
    currency === "KHR"
      ? Math.round((amount / KHR_TO_USD_RATE) * 100) / 100
      : Math.round(amount * 100) / 100;

  // 4. Payer name and account mask (*674)
  let payerName: string | null = null;
  let payerAccount: string | null = null;

  const payerMatch = /paid by\s+([\s\S]+?)(?:\s+\((\*?[A-Za-z0-9]+)\))?\s+on\s+/i.exec(text);
  if (payerMatch) {
    payerName = payerMatch[1].replace(/\r?\n/g, " ").trim();
    payerAccount = payerMatch[2] ? payerMatch[2].trim() : null;
  }

  // 5. Transaction Date Raw & Parsed
  let transactionDateRaw: string | null = null;
  let transactionDate: Date = fallbackDate;

  // Match: "on Oct 22, 01:05 PM" or "on Oct 22, 2026 12:36 PM"
  const dateMatch = /on\s+([A-Za-z]{3}\s+\d{1,2}(?:,\s+\d{4})?,?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i.exec(text);
  // Fallback match: "[22/10/26 12:36 PM]" or "22/10/26 12:36 PM"
  const bracketDateMatch = /\[?(\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)\]?/i.exec(text);

  if (dateMatch) {
    transactionDateRaw = dateMatch[1].trim();
    try {
      const currentYear = fallbackDate.getFullYear();
      let parseable = transactionDateRaw;
      if (!/\d{4}/.test(parseable)) {
        // inject year: "Oct 22, 01:05 PM" -> "Oct 22, 2026 01:05 PM"
        parseable = parseable.replace(/([A-Za-z]{3}\s+\d{1,2}),?/, `$1, ${currentYear}`);
      }
      if (!/[+-]\d{2}:?\d{2}$/.test(parseable)) {
        parseable = parseable + " +0700";
      }
      const parsed = new Date(parseable);
      if (!isNaN(parsed.getTime())) {
        transactionDate = parsed;
      }
    } catch {
      transactionDate = fallbackDate;
    }
  } else if (bracketDateMatch) {
    transactionDateRaw = bracketDateMatch[1].trim();
  }

  // 6. Bank Code / Payment Channel
  // "via ABA KHQR (AMRTKHPPXXX) at"
  let bankCode: string | null = null;
  const bankMatch = /via\s+([\s\S]+?)\s+at\s+/i.exec(text);
  if (bankMatch) {
    bankCode = bankMatch[1].replace(/\r?\n/g, " ").trim();
  }

  // 7. Merchant Name
  // "at SAM CHAN PANHA. Trx. ID"
  let merchantName: string | null = null;
  const merchantMatch = /at\s+([^.]+?)(?:\.|\n|Trx|$)/i.exec(text);
  if (merchantMatch) {
    merchantName = merchantMatch[1].replace(/\r?\n/g, " ").trim();
  }

  return {
    rawMessage: text,
    source: "ABA_PAYWAY",
    trxId,
    apv,
    amount,
    currency,
    amountUsd,
    payerName,
    payerAccount,
    bankCode,
    merchantName,
    transactionDateRaw,
    transactionDate,
  };
}
