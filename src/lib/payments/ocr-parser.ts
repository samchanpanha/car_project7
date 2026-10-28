// Pure client & server safe receipt parser for Cambodian banking apps
// (ABA Mobile, Bakong KHQR, ACLEDA, Wing, Canadia, Sathapana, etc.).
// Extracts Trx ID, APV, amount, currency, timestamp, and payee without any Node native dependencies.

import { detectBankFromContext } from "./bank-directory";
import { arePaymentRefsMatching } from "./reference";

export interface ParsedReceiptData {
  trxId: string | null;
  externalRef: string | null;
  apv: string | null;
  amount: number | null;
  currency: "USD" | "KHR" | null;
  amountUsd: number | null;
  amountKhr: number | null;
  paidAt: Date | null;
  paidAtRaw: string | null;
  payerName: string | null;
  payerAccount: string | null;
  payee: string | null;
  beneficiaryBank: string | null;
  bankName: string | null;
  bankCode: string | null;
  isInterbank: boolean;
  rawText: string;
  confidence: number; // 0 - 100
}

export interface VerificationResult {
  status: "PASS" | "WARN" | "MISMATCH";
  confidence: number;
  amountMatch: boolean;
  currencyMatch: boolean;
  isDuplicate: boolean;
  duplicateDetails?: string | null;
  isOld: boolean;
  ageHours?: number | null;
  isNotCurrentDate?: boolean;
  transactionDateFormatted?: string;
  telegramAdmin?: string;
  telegramAdminLink?: string;
  isInterbank?: boolean;
  originatingBank?: string;
  abaTrxId?: string;
  isRefMismatch?: boolean;
  refMismatchDetails?: string | null;
  detectedRefOnSlip?: string | null;
  isWrongMerchant?: boolean;
  detectedPayee?: string | null;
  expectedMerchant?: string | null;
  isUnderpaid?: boolean;
  riskFlags: string[];
  message: string;
}

export { arePaymentRefsMatching };

/** Extract receipt fields specifically tuned for Cambodian bank confirmation receipts (ABA Mobile, ACLEDA Bank, Wing, Canadia, UCB, etc.). */
export function parseReceiptText(rawText: string): ParsedReceiptData {
  const text = rawText.replace(/\r\n/g, "\n");

  // 1. Transaction Reference & External Ref
  let trxId: string | null = null;
  let externalRef: string | null = null;
  let apv: string | null = null;

  // External Txn Ref (e.g. "External Txn Ref : 6e0973e6" on ACLEDA, "External Txn Ref ffa673fe" on UCB)
  const extRefMatch = text.match(/(?:External\s*Txn\s*Ref|External\s*Ref|Ext\s*Ref)[:\s#]*([0-9a-zA-Z]{6,32})/i);
  if (extRefMatch) {
    externalRef = extRefMatch[1].trim();
  }

  // Helper to reject non-transaction IDs (merchant codes, UI keywords, phone numbers)
  const isInvalidCandidate = (val: string): boolean => {
    if (!val || val.length < 6) return true;
    const up = val.toUpperCase();
    if (
      /^(?:SUCCESSFUL|COMPLETED|PENDING|CONFIRMATION|MERCHANT|ACCOUNT|AMOUNT|BAKONG|MOBILE|PAYWAY|TRXID|TRANSFER|PAYMENT|NUMBER|RECEIPT|DETAIL|INFORMATION)$/.test(
        up,
      )
    ) {
      return true;
    }
    // Explicitly reject platform merchant ID ("125110123382784") and phone numbers
    if (up === "125110123382784" || /^0\d{8,10}$/.test(up)) {
      return true;
    }
    return false;
  };

  // 1A. Line-by-line label matching with OCR-noise tolerance
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length && !trxId; i++) {
    const line = lines[i];

    // Explicitly skip lines representing Merchant ID, Terminal ID, Account, Phone
    if (
      /^(?:Merchant|Terminal|Device|Customer|Payer|Sender|Receiver|Beneficiary|Bank|From|To)\s*(?:ID|Code|No\.?|Number)\b/i.test(
        line,
      )
    ) {
      continue;
    }

    // Match lines like "Transaction ID: 000245426300FU69", "Trx. ID: 179264913984347", "Ref No. FT262967KHCC"
    const lineMatch = line.match(
      /(?:^|[^A-Za-z])(?:Transact(?:ion|lon|1on|[|]on)?|Trx\.?|Txn\.?|Reference|Ref\.?|Bakong)\s*(?:ID|No\.?|#|Number|Ref|[|]D|1D)?[:\s#\-]+([0-9A-Za-z]{6,32})/i,
    );
    if (lineMatch) {
      const cand = lineMatch[1].trim();
      if (!isInvalidCandidate(cand)) {
        trxId = cand;
        break;
      }
    }

    // Match label on current line and value on next line (e.g. "Transaction ID\n000245426300FU69")
    if (
      /^(?:Transact(?:ion|lon|1on|[|]on)?|Trx\.?|Txn\.?|Reference|Ref\.?|Bakong)\s*(?:ID|No\.?|#|Number|Ref|[|]D|1D)?[:\s#\-]*$/i.test(
        line,
      )
    ) {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const nextMatch = nextLine.match(/^([0-9A-Za-z]{6,32})$/);
        if (nextMatch) {
          const cand = nextMatch[1].trim();
          if (!isInvalidCandidate(cand)) {
            trxId = cand;
            break;
          }
        }
      }
    }
  }

  // 1B. Format-specific recognition for Cambodian bank receipt standards:
  // Wing Bank & Bakong 16-character alphanumeric reference (e.g. 000245426300FU69, 000245426296F1T4)
  if (!trxId) {
    const wingBakongMatch = text.match(/\b(00024\d{7}[0-9A-Za-z]{4})\b/);
    if (wingBakongMatch && !isInvalidCandidate(wingBakongMatch[1])) {
      trxId = wingBakongMatch[1];
    }
  }

  // Canadia Bank FT reference (e.g. FT26299HFCG3, FT262967KHCC)
  if (!trxId) {
    const canadiaMatch = text.match(/\b(FT\d{2}[0-9A-Za-z]{8,14})\b/i);
    if (canadiaMatch && !isInvalidCandidate(canadiaMatch[1])) {
      trxId = canadiaMatch[1].toUpperCase();
    }
  }

  // ACLEDA Bank external reference fallback
  if (!trxId && externalRef && !isInvalidCandidate(externalRef)) {
    trxId = externalRef;
  }

  // Standalone ABA 15-digit Trx ID (ABA Mobile transaction IDs strictly start with 17)
  // Must NOT match Merchant ID or Account numbers (e.g. 125110123382784)
  if (!trxId) {
    const abaMatches = [...text.matchAll(/(?<!(?:Merchant|Terminal|Account|Acc|From|To|Payer)[:\s#]*)\b(17\d{13})\b/gi)];
    for (const m of abaMatches) {
      const cand = m[1].trim();
      if (!isInvalidCandidate(cand)) {
        trxId = cand;
        break;
      }
    }
  }

  // 1C. Fallback to general reference regex if still not resolved
  if (!trxId) {
    const refMatch = text.match(
      /(?:Reference(?:\s*(?:No\.?|ID|#|Number))?|\bRef(?:\s*(?:No\.?|ID|#|Number))?|Trx\.?\s*(?:ID|No\.?|#)?|Transaction\s*(?:ID|No\.?|Ref|Hash|Number)?|Txn\s*(?:ID|No\.?|#)?|Bank\s*Ref(?:\s*No\.?)?)[:\s#]+([0-9A-Za-z]{6,32})/i,
    );
    if (refMatch && !isInvalidCandidate(refMatch[1])) {
      trxId = refMatch[1].trim();
    }
  }

  // 2. APV code (6 digits)
  const apvMatch = text.match(/\bAPV[:\s#]*([0-9]{6})\b/i);
  if (apvMatch) {
    apv = apvMatch[1].trim();
  }

  // 3. Bank Identification (supports all Cambodian commercial banks & Bakong)
  let bankName: string | null = null;
  let bankCode: string | null = null;
  let isInterbank = false;

  const detectedBank = detectBankFromContext({
    ref: trxId || externalRef || undefined,
    rawText: text,
  });

  if (detectedBank) {
    bankName = detectedBank.name;
    bankCode = detectedBank.code;
    isInterbank = detectedBank.code !== "ABA";
  } else if (!/(?:transfer\s*to|beneficiary.*bank)\s*aba/i.test(text) && /ABA\s*Mobile|PayWay\s*by\s*ABA|ABA\s*Bank/i.test(text)) {
    bankName = "ABA Bank";
    bankCode = "ABA";
    isInterbank = false;
  }

  // 4. Payer Details (From Account & Account No)
  let payerName: string | null = null;
  let payerAccount: string | null = null;

  const fromMatch = text.match(/(?:From\s*Account|From|Sender|Payer)[:\s]*([A-Za-z\s]{3,35})(?:\n|$)/i);
  if (fromMatch) {
    payerName = fromMatch[1].trim().replace(/\s+/g, " ");
  }

  const accMatch = text.match(/(?:Account\s*No\.?|From\s*Acc|Account)[:\s]*([0-9\s*]{4,25})/i);
  if (accMatch) {
    const rawAcc = accMatch[1].replace(/\s+/g, "");
    const lastDigits = rawAcc.match(/(\d{3,4})$/);
    if (lastDigits) {
      payerAccount = `*${lastDigits[1]}`;
    }
  } else if (fromMatch) {
    // Check if subsequent line contains account number digits
    const afterFrom = text.slice(text.indexOf(fromMatch[0]) + fromMatch[0].length);
    const nextDigits = afterFrom.match(/^\s*([0-9]{6,16})/);
    if (nextDigits) {
      const rawAcc = nextDigits[1].trim();
      const lastDigits = rawAcc.match(/(\d{3,4})$/);
      if (lastDigits) {
        payerAccount = `*${lastDigits[1]}`;
      }
    }
  }

  // 5. Payee & Beneficiary Bank
  let payee: string | null = null;
  let beneficiaryBank: string | null = null;

  // Extract explicit payee (e.g. "Merchant Name: SAM CHAN PANHA", "Paid to ...", "Payee: ...", "To: ...", "KHQR to: ...")
  const toMatch = text.match(/(?:Merchant\s*Name|Paid\s*to|Payee|KHQR\s*to|To\s*Account|To\s*Merchant|(?:^|\n|\r)\s*To)[:\s]*([^\r\n]{3,50})(?:\n|\r|$)/i);
  if (toMatch) {
    const rawVal = toMatch[1].trim().replace(/\s+/g, " ");
    if (!/^(ID|Bank|ABA Bank|Wing Bank|Canadia Bank|ACLEDA Bank|Account)/i.test(rawVal)) {
      payee = rawVal;
    }
  }

  const benBankMatch = text.match(/(?:Beneficiary\s*Bank|Transfer\s*to\s*Bank|Transfer\s*to)[:\s]*([A-Za-z\s]{3,25})(?:\n|$)/i);
  if (benBankMatch) {
    beneficiaryBank = benBankMatch[1].trim();
  }

  // 6. Amount & Currency
  let amountUsd: number | null = null;
  let amountKhr: number | null = null;

  // USD regexes: require explicit $ or USD symbol/word
  const usdRegexes = [
    /(?:Debit\s*Amount|Amount|Total)?[:\s]*-?\s*\$\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /(?:Debit\s*Amount|Amount|Total)?[:\s]*-?\s*([0-9]+(?:\.[0-9]{2})?)\s*USD\b/i,
    /(?:Debit\s*Amount|Amount|Total)?[:\s]*-?\s*USD\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /([0-9]+(?:\.[0-9]{2})?)\s*USD\b/i,
  ];
  for (const rx of usdRegexes) {
    const m = text.match(rx);
    if (m) {
      const val = parseFloat(m[1]);
      if (val > 0 && Number.isFinite(val)) {
        amountUsd = val;
        break;
      }
    }
  }

  // KHR regexes: e.g. "100.00 KHR" or "100 ៛" or "Debit Amount : -100 KHR" or "៛200,900" or "200,900 KHR"
  const khrRegexes = [
    /(?:Debit\s*Amount|Amount|Total)[:\s]*-?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:KHR|៛)/i,
    /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,9})(?:\.[0-9]{1,2})?\s*(?:៛|KHR)\b/i,
    /[៛]\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*៛/i,
    /\(([0-9,]+(?:\.[0-9]{1,2})?)\s*KHR\)/i,
  ];
  for (const rx of khrRegexes) {
    const m = text.match(rx);
    if (m) {
      const cleanNum = parseInt(m[1].replace(/,/g, "").split(".")[0], 10);
      if (cleanNum > 0 && Number.isFinite(cleanNum)) {
        amountKhr = cleanNum;
        break;
      }
    }
  }

  let currency: "USD" | "KHR" | null = null;
  let amount: number | null = null;
  if (amountUsd !== null && amountKhr === null) {
    currency = "USD";
    amount = amountUsd;
  } else if (amountKhr !== null && amountUsd === null) {
    currency = "KHR";
    amount = amountKhr;
  } else if (amountUsd !== null && amountKhr !== null) {
    if (/[៛]|KHR/i.test(text) && !/[$]|USD/i.test(text)) {
      currency = "KHR";
      amount = amountKhr;
    } else {
      currency = "USD";
      amount = amountUsd;
    }
  }

  // 7. Paid Date & Time
  let paidAt: Date | null = null;
  let paidAtRaw: string | null = null;

  const datePatterns = [
    // Date: 24 Oct-2026 3:20 PM or Date: 24 Oct 2026
    /(?:date|paid\s*on|time)[:\s]*([0-9]{1,2}[^\S\r\n]+[A-Za-z]+[-/,\s]+\d{4}(?:,?[^\S\r\n]*\d{1,2}:\d{2}(?::\d{2})?(?:[^\S\r\n]*(?:AM|PM)\b)?)?)/i,
    // Oct 22, 2026 | 11:26 PM or Oct 22, 2026 11:26 PM
    /([A-Za-z]{3}[^\S\r\n]+\d{1,2}(?:,[^\S\r\n]+\d{4})?[^\S\r\n]*[|,]?[^\S\r\n]*\d{1,2}:\d{2}(?::\d{2})?(?:[^\S\r\n]*(?:AM|PM)\b)?)/i,
    // 22 Oct 2026, 01:05 PM or 24 Oct-2026 3:20 PM
    /(\d{1,2}[^\S\r\n]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/,\s]+\d{4}(?:,?[^\S\r\n]*\d{1,2}:\d{2}(?::\d{2})?(?:[^\S\r\n]*(?:AM|PM)\b)?)?)/i,
    // 2026-10-22 13:05:00
    /(\d{4}[-/]\d{2}[-/]\d{2}(?:[^\S\r\n]+\d{1,2}:\d{2}(?::\d{2})?(?:[^\S\r\n]*[AP]M\b)?)?)/i,
    // 22/10/2026 13:05
    /(\d{1,2}[-/]\d{2}[-/]\d{4}(?:[^\S\r\n]+\d{1,2}:\d{2}(?::\d{2})?(?:[^\S\r\n]*[AP]M\b)?)?)/i,
  ];

  for (const rx of datePatterns) {
    const m = text.match(rx);
    if (m) {
      paidAtRaw = m[1].trim();
      let sanitized = paidAtRaw
        .replace("|", " ")
        .replace(/-(?=\d{4})/, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(sanitized)) {
        sanitized = sanitized.replace(" ", "T");
      }
      const parsedTs = Date.parse(sanitized);
      if (!Number.isNaN(parsedTs)) {
        paidAt = new Date(parsedTs);
        break;
      }
    }
  }

  // Calculate extraction confidence score (0 to 100)
  let score = 0;
  if (trxId) score += 35;
  if (externalRef) score += 15;
  if (amount !== null) score += 25;
  if (currency !== null) score += 10;
  if (bankName !== null) score += 10;
  if (paidAt !== null) score += 5;

  return {
    trxId,
    externalRef,
    apv,
    amount,
    currency,
    amountUsd,
    amountKhr,
    paidAt,
    paidAtRaw,
    payerName,
    payerAccount,
    payee,
    beneficiaryBank,
    bankName,
    bankCode,
    isInterbank,
    rawText: text,
    confidence: Math.min(100, score),
  };
}

/** Helper to identify bank code from receipt text */
export function detectBankFromReceipt(rawText: string): string | null {
  const bank = detectBankFromContext({ rawText });
  if (bank) {
    if (bank.code === "ACLB") return "ACLEDA";
    if (bank.code === "CAND") return "CANADIA";
    return bank.code;
  }
  if (/ABA\s*Mobile|PayWay\s*by\s*ABA|ABA\s*Bank|Advanced\s*Bank\s*of\s*Asia/i.test(rawText)) {
    return "ABA";
  }
  return null;
}

