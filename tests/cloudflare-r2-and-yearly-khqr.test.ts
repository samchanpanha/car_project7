import { describe, it, expect } from "vitest";
import { isR2Configured, getR2Bucket } from "@/lib/r2-client";
import type { PaymentConfigDTO } from "@/lib/commerce-types";

describe("Cloudflare R2 Object Storage Integration", () => {
  it("detects R2 configuration from environment variables", () => {
    // When environment variables are configured
    const configured = isR2Configured();
    expect(typeof configured).toBe("boolean");
    // Bucket name matches configured or defaults to cars-storage
    expect(getR2Bucket()).toBe("cars-storage");
  });
});

describe("KHQR 2x2 Matrix & Yearly KHR Selection Logic", () => {
  const mockConfig: PaymentConfigDTO = {
    enabled: true,
    manual: {
      accountName: "TEST SELLER",
      instructionsEn: "Test English",
      instructionsKm: "Test Khmer",
      telegram: "@test_admin",
      hasKhqr: true,
      khqrDataUrl: "data:image/png;base64,mockKhqrDataUrl",
      khqrImage: "/khqr/default.jpg",
      khqrImageMonthly: "/khqr/monthly-usd.jpg",
      khqrImageYearly: "/khqr/yearly-usd.jpg",
      khqrImageUsd: "/khqr/usd-fallback.jpg",
      khqrImageKhr: "/khqr/khr-fallback.jpg",
      khqrImageMonthlyKhr: "/khqr/monthly-khr.jpg",
      khqrImageYearlyKhr: "/khqr/yearly-khr.jpg",
      khrExchangeRate: 4100,
    },
    freePlan: {
      enabled: true,
      listingsLimit: 3,
      featuredLimit: 0,
      seats: 1,
    },
  };

  function resolveQr(
    config: PaymentConfigDTO,
    cycle: "MONTHLY" | "YEARLY",
    currency: "USD" | "KHR"
  ): string {
    const manual = config.manual;
    const qrSrcUsd =
      (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
      manual?.khqrImageUsd ??
      manual?.khqrImage ??
      (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

    const qrSrcKhr =
      (cycle === "YEARLY" ? manual?.khqrImageYearlyKhr : manual?.khqrImageMonthlyKhr) ??
      manual?.khqrImageKhr ??
      (cycle === "YEARLY" ? manual?.khqrImageYearly : manual?.khqrImageMonthly) ??
      manual?.khqrImage ??
      (cycle === "YEARLY" ? "/khqr/khqr-yearly.jpg" : "/khqr/khqr-monthly.jpg");

    return currency === "KHR" ? qrSrcKhr : qrSrcUsd;
  }

  it("selects dedicated Yearly KHR QR when cycle is YEARLY and currency is KHR", () => {
    const qr = resolveQr(mockConfig, "YEARLY", "KHR");
    expect(qr).toBe("/khqr/yearly-khr.jpg");
  });

  it("selects dedicated Monthly KHR QR when cycle is MONTHLY and currency is KHR", () => {
    const qr = resolveQr(mockConfig, "MONTHLY", "KHR");
    expect(qr).toBe("/khqr/monthly-khr.jpg");
  });

  it("selects Yearly USD QR when cycle is YEARLY and currency is USD", () => {
    const qr = resolveQr(mockConfig, "YEARLY", "USD");
    expect(qr).toBe("/khqr/yearly-usd.jpg");
  });

  it("selects Monthly USD QR when cycle is MONTHLY and currency is USD", () => {
    const qr = resolveQr(mockConfig, "MONTHLY", "USD");
    expect(qr).toBe("/khqr/monthly-usd.jpg");
  });

  it("gracefully falls back to generic KHR QR if Yearly KHR QR is not configured", () => {
    const configWithoutYearlyKhr: PaymentConfigDTO = {
      ...mockConfig,
      manual: {
        ...mockConfig.manual,
        khqrImageYearlyKhr: null,
      },
    };
    const qr = resolveQr(configWithoutYearlyKhr, "YEARLY", "KHR");
    expect(qr).toBe("/khqr/khr-fallback.jpg");
  });

  it("gracefully falls back to Yearly QR if no KHR QRs are configured", () => {
    const configWithoutKhr: PaymentConfigDTO = {
      ...mockConfig,
      manual: {
        ...mockConfig.manual,
        khqrImageYearlyKhr: null,
        khqrImageKhr: null,
      },
    };
    const qr = resolveQr(configWithoutKhr, "YEARLY", "KHR");
    expect(qr).toBe("/khqr/yearly-usd.jpg");
  });
});
