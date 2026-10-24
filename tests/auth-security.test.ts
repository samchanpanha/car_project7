import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  normalizeKhmerPhone,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth";

describe("Auth & Security Utilities", () => {
  describe("Password Hashing & Verification (SCrypt)", () => {
    it("should hash a password and verify it successfully", () => {
      const password = "Secur3Password!2026";
      const hash = hashPassword(password);

      expect(hash).toContain(":");
      const [salt, key] = hash.split(":");
      expect(salt.length).toBe(32); // 16 bytes hex
      expect(key.length).toBe(128); // 64 bytes hex

      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword("WrongPassword", hash)).toBe(false);
      expect(verifyPassword("", hash)).toBe(false);
    });

    it("should safely reject null or malformed hashes", () => {
      expect(verifyPassword("password", null)).toBe(false);
      expect(verifyPassword("password", "")).toBe(false);
      expect(verifyPassword("password", "invalid_no_colon")).toBe(false);
    });
  });

  describe("Khmer Phone Normalization", () => {
    it("should normalize local 0-prefixed Cambodian mobile numbers", () => {
      expect(normalizeKhmerPhone("012 345 678")).toBe("+85512345678");
      expect(normalizeKhmerPhone("098-765-432")).toBe("+85598765432");
      expect(normalizeKhmerPhone("077.123.456")).toBe("+85577123456");
      expect(normalizeKhmerPhone("010112233")).toBe("+85510112233");
    });

    it("should normalize 855-prefixed numbers without plus", () => {
      expect(normalizeKhmerPhone("85512345678")).toBe("+85512345678");
      expect(normalizeKhmerPhone("855 98 765 432")).toBe("+85598765432");
    });

    it("should preserve already canonical +855 numbers", () => {
      expect(normalizeKhmerPhone("+85512345678")).toBe("+85512345678");
    });

    it("should reject invalid, too short, or non-numeric inputs", () => {
      expect(normalizeKhmerPhone("123")).toBeNull();
      expect(normalizeKhmerPhone("abcdef")).toBeNull();
      expect(normalizeKhmerPhone("")).toBeNull();
    });
  });

  describe("HMAC Session Tokens", () => {
    it("should mint a signed token and verify the embedded user ID", () => {
      const userId = "usr_test_12345";
      const token = createSessionToken(userId);

      expect(token).toBeTruthy();
      expect(token.split(".")).toHaveLength(3);

      const verifiedUserId = verifySessionToken(token);
      expect(verifiedUserId).toBe(userId);
    });

    it("should reject tampered or corrupt session tokens", () => {
      const token = createSessionToken("usr_legit_user");
      const parts = token.split(".");
      
      // Tamper payload
      const tampered = `${parts[0]}.badpayload.${parts[2]}`;
      expect(verifySessionToken(tampered)).toBeNull();

      // Tamper signature
      const badSig = `${parts[0]}.${parts[1]}.invalidsignature`;
      expect(verifySessionToken(badSig)).toBeNull();

      expect(verifySessionToken("")).toBeNull();
      expect(verifySessionToken("just_a_string")).toBeNull();
    });
  });
});
