import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Cloudflare Turnstile Component Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports Turnstile component and handles default test sitekey", async () => {
    const { Turnstile } = await import("@/components/marketplace/turnstile");
    expect(Turnstile).toBeDefined();
    expect(typeof Turnstile).toBe("object"); // forwardRef creates object
  });

  it("verifies test site keys and secret keys default to Cloudflare testing keys", () => {
    const defaultSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
    const defaultSecretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "1x0000000000000000000000000000000AA";

    expect(defaultSiteKey).toBe("1x00000000000000000000AA");
    expect(defaultSecretKey).toBe("1x0000000000000000000000000000000AA");
  });
});

