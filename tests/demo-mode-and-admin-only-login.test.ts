import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { readPlatformSettings, DEFAULT_SETTINGS } from "@/lib/platform-settings";
import { issueCaptchaToken } from "@/lib/captcha";
import { ensureDefaultSuperAdmin, DEFAULT_SUPER_ADMIN } from "@/lib/bootstrap";
import { GET as sessionGet, POST as sessionPost } from "@/app/api/session/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { PUT as settingsPut } from "@/app/api/admin/settings/route";
import * as guards from "@/lib/api/guards";
import * as sessionModule from "@/lib/session";
import { hashPassword } from "@/lib/auth";

describe("Demo Mode Display & Admin-Only Login Controls", () => {
  const mockAdminUser: sessionModule.DemoUser = {
    id: DEFAULT_SUPER_ADMIN.id,
    phone: DEFAULT_SUPER_ADMIN.phone,
    name: DEFAULT_SUPER_ADMIN.name,
    role: "SUPER_ADMIN",
    locale: "en",
    email: null,
    phoneVerified: true,
    avatarUrl: null,
    passwordHash: null,
    telegramId: null,
    telegramUsername: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    sellerProfile: null,
  };

  const mockBuyerUser: sessionModule.DemoUser = {
    id: "usr_demo_buyer",
    phone: "+85511998877",
    name: "Dara Sok",
    role: "BUYER",
    locale: "km",
    email: null,
    phoneVerified: true,
    avatarUrl: null,
    passwordHash: null,
    telegramId: null,
    telegramUsername: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    sellerProfile: null,
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    await ensureDefaultSuperAdmin();
  });

  afterAll(async () => {
    // Restore default settings
    await db.platformSetting.deleteMany({
      where: { key: { in: ["demoModeEnabled", "adminOnlyLogin"] } },
    });
  });

  it("1. Platform settings defaults strictly to demoModeEnabled=false and adminOnlyLogin=true", async () => {
    expect(DEFAULT_SETTINGS.demoModeEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.adminOnlyLogin).toBe(true);
  });

  it("2. Super Admin can update demoModeEnabled and adminOnlyLogin via PUT /api/admin/settings", async () => {
    vi.spyOn(guards, "requireAdmin").mockResolvedValue(mockAdminUser);

    const req = new Request("http://localhost:3000/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commissionPct: 3.0,
        featuredListingPriceUsd: 30,
        autoApproveListings: true,
        maintenanceMode: false,
        freeTrialEnabled: true,
        freeTrialDays: 45,
        demoModeEnabled: true,
        adminOnlyLogin: false,
      }),
    });

    const res = await settingsPut(req);
    expect(res.status).toBe(200);

    const settings = await readPlatformSettings();
    expect(settings.demoModeEnabled).toBe(true);
    expect(settings.adminOnlyLogin).toBe(false);
  });

  it("3. GET /api/session hides personas when demoModeEnabled=false", async () => {
    // Explicitly set demoModeEnabled=false
    await db.platformSetting.upsert({
      where: { key: "demoModeEnabled" },
      create: { key: "demoModeEnabled", valueJson: "false" },
      update: { valueJson: "false" },
    });

    vi.spyOn(sessionModule, "getCurrentUser").mockResolvedValue(mockBuyerUser);
    vi.spyOn(sessionModule, "getActivePersonaId").mockResolvedValue(null);

    const res = await sessionGet();
    expect(res.status).toBe(200);
    const session = await res.json();

    expect(session.demoModeEnabled).toBe(false);
    expect(session.personas).toEqual([]);
    expect(session.demoPersona).toBe(false);
  });

  it("4. POST /api/session blocks switching when demoModeEnabled=false for non-admin", async () => {
    await db.platformSetting.upsert({
      where: { key: "demoModeEnabled" },
      create: { key: "demoModeEnabled", valueJson: "false" },
      update: { valueJson: "false" },
    });

    vi.spyOn(sessionModule, "getCurrentUser").mockResolvedValue(mockBuyerUser);

    const req = new Request("http://localhost:3000/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "usr_dealer_sokha" }),
    });

    const res = await sessionPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("disabled");
  });

  it("5. POST /api/auth/login blocks non-admin users when adminOnlyLogin=true", async () => {
    await db.platformSetting.upsert({
      where: { key: "adminOnlyLogin" },
      create: { key: "adminOnlyLogin", valueJson: "true" },
      update: { valueJson: "true" },
    });

    // Ensure a regular buyer exists with a password
    const testBuyerPhone = "+85512777888";
    await db.user.upsert({
      where: { phone: testBuyerPhone },
      create: {
        id: "usr_test_buyer_strict",
        phone: testBuyerPhone,
        name: "Test Buyer",
        role: "BUYER",
        passwordHash: hashPassword("password123"),
      },
      update: {
        role: "BUYER",
        passwordHash: hashPassword("password123"),
      },
    });

    const captchaToken = issueCaptchaToken();
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: testBuyerPhone,
        password: "password123",
        captchaToken,
      }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("restricted to administrators only");
  });

  it("6. POST /api/auth/login allows Super Admin to log in when adminOnlyLogin=true", async () => {
    await db.platformSetting.upsert({
      where: { key: "adminOnlyLogin" },
      create: { key: "adminOnlyLogin", valueJson: "true" },
      update: { valueJson: "true" },
    });

    const captchaToken = issueCaptchaToken();
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: DEFAULT_SUPER_ADMIN.phone,
        password: DEFAULT_SUPER_ADMIN.password,
        captchaToken,
      }),
    });

    const res = await loginPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.role).toBe("SUPER_ADMIN");
  });

  it("7. POST /api/auth/register rejects public registration when adminOnlyLogin=true", async () => {
    await db.platformSetting.upsert({
      where: { key: "adminOnlyLogin" },
      create: { key: "adminOnlyLogin", valueJson: "true" },
      update: { valueJson: "true" },
    });

    const captchaToken = issueCaptchaToken();
    const req = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New Guest",
        phone: "+85598123456",
        password: "password123",
        captchaToken,
      }),
    });

    const res = await registerPost(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Public registration is currently disabled");
  });
});
