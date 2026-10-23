// Bank-reference normalization and duplicate-key derivation.
//
// A Khmer bank receipt can expose either a 15-digit ABA PayWay "Trx. ID" or a
// 6-digit APV approval code. Trx IDs are globally unique; APV codes are only
// unique per day, so the duplicate key is date-scoped for APVs.

export type RefKind = "TRX" | "APV";

export interface NormalizedPaymentRef {
  /** Trimmed user input, safe to display. */
  raw: string;
  /** Uppercased, whitespace-stripped value stored in canonical columns. */
  value: string;
  /** Globally comparable key (nullable only when the input is unusable). */
  key: string;
  kind: RefKind;
}

const CONFUSION_MAP: Record<string, string> = {
  O: "0",
  I: "1",
  L: "1",
  S: "5",
  B: "8",
};

/** Cambodia is UTC+7 year-round; APV keys must follow the bank's calendar day. */
export function phnomPenhDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Returns true if the given date is the current calendar date in Cambodia (UTC+7). */
export function isCurrentDateInCambodia(date: Date): boolean {
  return phnomPenhDateKey(date) === phnomPenhDateKey(new Date());
}

/** Returns formatted human-readable date in Cambodia time (e.g. "Oct 22, 2026"). */
export function formatPhnomPenhDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "Asia/Phnom_Penh",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Normalize a bank reference.
 *
 * - removes spaces, dashes, `#`, and common labels
 * - uppercases
 * - repairs common OCR digit confusions only when the value is mostly numeric
 * - classifies 6-digit values as APV and everything else as TRX
 *
 * `paidAt` is used for the APV date scope. Pass the ABA/OCR transaction date
 * when known, otherwise the submission time is used.
 */
export function normalizePaymentRef(
  input: string,
  opts?: { paidAt?: Date | null; forceKind?: RefKind | null },
): NormalizedPaymentRef | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let value = raw
    .toUpperCase()
    .replace(/^(?:TRX(?:\.?\s*ID)?|TRANSACTION\s*ID|TXN(?:\s*ID)?|APV|REF(?:ERENCE)?(?:\s*(?:NO|ID|#))?)\s*[:#-]?\s*/i, "")
    .replace(/[^A-Z0-9]/g, "");

  if (!value) return null;

  const digits = (value.match(/[0-9]/g) ?? []).length;
  const mostlyNumeric = /^[0-9OILSB]+$/.test(value) && digits >= Math.max(4, value.length - 3);
  if (mostlyNumeric) {
    value = value
      .split("")
      .map((ch) => CONFUSION_MAP[ch] ?? ch)
      .join("");
  }

  if (value.length < 4 || value.length > 40) return null;

  const kind: RefKind =
    opts?.forceKind ??
    (/^\d{6}$/.test(value) ? "APV" : "TRX");
  const scope = phnomPenhDateKey(opts?.paidAt instanceof Date ? opts.paidAt : new Date());
  const key = kind === "APV" ? `APV:${value}:${scope}` : `TRX:${value}`;

  return { raw, value, key, kind };
}

/** True when the value looks like a usable reference (6-40 alphanumerics). */
export function isValidRefValue(value: string): boolean {
  return /^[A-Z0-9]{6,40}$/.test(value);
}

/** The refs we ask sellers to copy are digits; APVs are often 6 digits. */
export function refHint(value: string): string {
  if (/^\d{6}$/.test(value)) return "APV approval code";
  if (/^\d{10,}$/.test(value)) return "ABA Trx ID";
  return "bank reference";
}

/**
 * Compare an entered transaction reference against detected references on a receipt slip.
 * Handles normalization, prefix stripping (e.g. TRX-, APV-), whitespace, and case-insensitivity.
 */
export function arePaymentRefsMatching(
  enteredRef?: string | null,
  parsed?: {
    trxId?: string | null;
    externalRef?: string | null;
    apv?: string | null;
    rawText?: string | null;
  } | null,
): { match: boolean; matchedOn?: string; enteredNormalized?: string; detectedReference?: string } {
  if (!enteredRef || !enteredRef.trim()) return { match: true };
  if (!parsed) return { match: true };

  const rawEntered = enteredRef.trim();
  const enteredNorm = normalizePaymentRef(rawEntered);
  const enteredVal = enteredNorm ? enteredNorm.value.toUpperCase() : rawEntered.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!enteredVal || enteredVal.length < 3) return { match: true };

  const candidates: { source: string; val: string; original: string }[] = [];
  if (parsed.trxId) {
    const norm = normalizePaymentRef(parsed.trxId);
    candidates.push({
      source: "Trx ID",
      val: norm ? norm.value.toUpperCase() : parsed.trxId.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      original: parsed.trxId,
    });
  }
  if (parsed.externalRef) {
    const norm = normalizePaymentRef(parsed.externalRef);
    candidates.push({
      source: "External Ref",
      val: norm ? norm.value.toUpperCase() : parsed.externalRef.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      original: parsed.externalRef,
    });
  }
  if (parsed.apv) {
    const norm = normalizePaymentRef(parsed.apv);
    candidates.push({
      source: "APV Code",
      val: norm ? norm.value.toUpperCase() : parsed.apv.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      original: parsed.apv,
    });
  }

  const cleanRawText = (parsed.rawText || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  for (const c of candidates) {
    if (
      c.val === enteredVal ||
      (c.val.length >= 6 && enteredVal.length >= 6 && (c.val.includes(enteredVal) || enteredVal.includes(c.val)))
    ) {
      return { match: true, matchedOn: c.source, enteredNormalized: enteredVal, detectedReference: c.original };
    }
  }

  // Also check if entered reference (min 6 chars) appears verbatim anywhere in the OCR text
  if (enteredVal.length >= 6 && cleanRawText.includes(enteredVal)) {
    return { match: true, matchedOn: "Receipt Text", enteredNormalized: enteredVal, detectedReference: enteredVal };
  }

  const primaryCandidate = candidates[0]?.original || null;
  if (candidates.length > 0) {
    return { match: false, enteredNormalized: enteredVal, detectedReference: primaryCandidate || undefined };
  }

  if (cleanRawText.length > 60 && enteredVal.length >= 8 && !cleanRawText.includes(enteredVal)) {
    return { match: false, enteredNormalized: enteredVal };
  }

  return { match: true };
}
