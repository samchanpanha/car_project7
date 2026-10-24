import { describe, it, expect } from "vitest";
import { parseReceiptText, detectBankFromReceipt } from "@/lib/payments/ocr";
import {
  phnomPenhDateKey,
  isCurrentDateInCambodia,
  formatPhnomPenhDate,
  arePaymentRefsMatching,
} from "@/lib/payments/reference";

describe("Payment OCR & Interbank Verification Utilities", () => {
  describe("Receipt OCR Parsing (ABA, ACLEDA, Wing, Canadia)", () => {
    it("should parse standard ABA Bank transaction slip", () => {
      const receipt = `
        ABA Bank Transfer Successful
        Transaction ID: 179264913984347
        Date: 24 Oct 2026, 03:20 PM
        Amount: $30.00 USD
        To: KHLAN PLATFORM CO., LTD.
        Account: 001 234 567
      `;

      const parsed = parseReceiptText(receipt);
      expect(parsed.amount).toBe(30.00);
      expect(parsed.currency).toBe("USD");
      expect(parsed.trxId).toBe("179264913984347");
      expect(parsed.paidAt).not.toBeNull();
    });

    it("should parse ACLEDA Bank mobile slip with KHR or USD", () => {
      const receipt = `
        ធនាគារ អេស៊ីលីដា ភីអិលស៊ី
        ACLEDA Bank Plc.
        Trx Ref: ACL88491023
        Date: 24 Oct-2026 11:15 AM
        Amount: USD 30.00
        From: Sopheak Ngin
      `;

      const parsed = parseReceiptText(receipt);
      expect(parsed.amount).toBe(30.00);
      expect(parsed.currency).toBe("USD");
      expect(parsed.trxId).toBe("ACL88491023");
      expect(parsed.paidAt).not.toBeNull();
    });

    it("should parse Wing Bank KHQR transaction receipt", () => {
      const receipt = `
        Wing Bank Transfer Confirmation
        Reference No: WING9928172
        Date: 2026-10-24 14:05:00
        Amount: $10.00
        Status: Success
      `;

      const parsed = parseReceiptText(receipt);
      expect(parsed.amount).toBe(10.00);
      expect(parsed.trxId).toBe("WING9928172");
      expect(parsed.paidAt).not.toBeNull();
    });

    it("should detect bank accurately from raw receipt text", () => {
      expect(detectBankFromReceipt("Advanced Bank of Asia ABA")).toBe("ABA");
      expect(detectBankFromReceipt("ACLEDA Bank ToanChet")).toBe("ACLEDA");
      expect(detectBankFromReceipt("Canadia Bank Smart Banking")).toBe("CANADIA");
      expect(detectBankFromReceipt("Wing Bank KHQR Transfer")).toBe("WING");
      expect(detectBankFromReceipt("Unknown Slip 12345")).toBeNull();
    });
  });

  describe("Cambodia Timezone & Reference Matching", () => {
    it("should compute Phnom Penh (UTC+7) calendar date key YYYYMMDD", () => {
      // 2026-10-24T00:30:00Z is 07:30 AM in Phnom Penh on 2026-10-24
      const d1 = new Date("2026-10-24T00:30:00Z");
      expect(phnomPenhDateKey(d1)).toBe("20261024");
      expect(formatPhnomPenhDate(d1)).toBe("Oct 24, 2026");

      // 2026-10-23T23:30:00Z is 06:30 AM in Phnom Penh on 2026-10-24
      const d2 = new Date("2026-10-23T23:30:00Z");
      expect(phnomPenhDateKey(d2)).toBe("20261024");
    });

    it("should correctly verify current date matching", () => {
      const now = new Date();
      expect(isCurrentDateInCambodia(now)).toBe(true);

      const yesterday = new Date(Date.now() - 24 * 3600 * 1000 * 3);
      expect(isCurrentDateInCambodia(yesterday)).toBe(false);
    });

    it("should match entered reference against OCR detected reference", () => {
      const parsedMock = {
        trxId: "179264913984347",
        externalRef: "ACL998811",
        apv: "894102",
        rawText: "Transaction 179264913984347 completed",
      };

      // Exact Trx ID match
      expect(arePaymentRefsMatching("179264913984347", parsedMock).match).toBe(true);

      // Suffix / substring match
      expect(arePaymentRefsMatching("3984347", parsedMock).match).toBe(true);

      // External ref match
      expect(arePaymentRefsMatching("ACL998811", parsedMock).match).toBe(true);

      // APV match
      expect(arePaymentRefsMatching("894102", parsedMock).match).toBe(true);

      // Unrelated reference mismatch
      expect(arePaymentRefsMatching("999999999999", parsedMock).match).toBe(false);
    });
  });
});
