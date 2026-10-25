import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { parseTmaDeepLink } from "@/lib/telegram";
import { readTelegramConfig, saveTelegramConfig, testTelegramBotConnection } from "@/lib/telegram-config";
import { GET as adminTgGet, PUT as adminTgPut } from "@/app/api/admin/telegram/route";
import { POST as adminTgTestPost } from "@/app/api/admin/telegram/test/route";
import { GET as publicTgConfigGet } from "@/app/api/telegram/public-config/route";
import * as guards from "@/lib/api/guards";
import type { DemoUser } from "@/lib/session";
import { DEFAULT_SUPER_ADMIN, ensureDefaultSuperAdmin } from "@/lib/bootstrap";

describe("Telegram Mini App Integration & Super Admin Control Center", () => {
  const mockAdminUser: DemoUser = {
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

  const mockNormalUser: DemoUser = {
    id: "usr_buyer_test",
    phone: "+85511000111",
    name: "Regular Buyer",
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
    vi.restoreAllMocks();
  });

  describe("Telegram Mini App Deep-Linking Parser", () => {
    it("correctly routes vehicle and spare part deep links to detail view", () => {
      const v1 = parseTmaDeepLink("vehicle_veh_prado_2018");
      expect(v1).toEqual({ name: "detail", vehicleId: "veh_prado_2018" });

      const v2 = parseTmaDeepLink("veh_rx300_2020");
      expect(v2).toEqual({ name: "detail", vehicleId: "veh_rx300_2020" });

      const v3 = parseTmaDeepLink("part_brake_prius");
      expect(v3).toEqual({ name: "detail", vehicleId: "part_brake_prius" });
    });

    it("correctly routes seller profile deep links to storefront", () => {
      const s1 = parseTmaDeepLink("seller_usr_nita");
      expect(s1).toEqual({ name: "seller", userId: "usr_nita" });

      const s2 = parseTmaDeepLink("usr_dealer_top");
      expect(s2).toEqual({ name: "seller", userId: "usr_dealer_top" });
    });

    it("correctly routes AI report deep links", () => {
      const r = parseTmaDeepLink("report_veh_prado_2018");
      expect(r).toEqual({ name: "report", vehicleId: "veh_prado_2018" });
    });

    it("correctly routes browse search queries with URI decoding", () => {
      const b = parseTmaDeepLink("browse_Toyota%20Prius");
      expect(b).toEqual({ name: "browse", q: "Toyota Prius" });
    });

    it("returns null for unrecognized or empty deep link params", () => {
      expect(parseTmaDeepLink(null)).toBeNull();
      expect(parseTmaDeepLink("")).toBeNull();
      expect(parseTmaDeepLink("random_unknown_param")).toBeNull();
    });
  });

  describe("Admin Telegram Configuration Management", () => {
    it("guards admin endpoints against non-admin callers", async () => {
      vi.spyOn(guards, "requireAdmin").mockRejectedValueOnce(
        new guards.HttpError(403, "Forbidden — admin only")
      );

      const res = await adminTgGet();
      expect(res.status).toBe(403);
    });

    it("allows Super Admin to view and update Telegram platform configuration", async () => {
      vi.spyOn(guards, "requireAdmin").mockResolvedValue(mockAdminUser);

      const putReq = new Request("http://localhost/api/admin/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botUsername: "@KhLanMarketBot",
          botToken: "123456789:TestTokenMockOnly",
          chatId: "-1001987654321",
          miniAppUrl: "https://t.me/KhLanMarketBot/app",
          channelUrl: "https://t.me/khlan_channel",
          groupUrl: "https://t.me/khlan_group",
          tmaEnabled: true,
          autoAuthEnabled: true,
          leadAlertsEnabled: true,
        }),
      });

      const putRes = await adminTgPut(putReq);
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.botUsername).toBe("KhLanMarketBot"); // '@' stripped
      expect(putData.miniAppUrl).toBe("https://t.me/KhLanMarketBot/app");
      expect(putData.tmaEnabled).toBe(true);

      // Verify GET returns the saved configuration
      const getRes = await adminTgGet();
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.botUsername).toBe("KhLanMarketBot");
      expect(getData.chatId).toBe("-1001987654321");
      expect(getData.miniAppUrl).toBe("https://t.me/KhLanMarketBot/app");
    });
  });

  describe("Admin Bot Connection Test Endpoint", () => {
    it("guards test endpoint against non-admin callers", async () => {
      vi.spyOn(guards, "requireAdmin").mockRejectedValueOnce(
        new guards.HttpError(403, "Forbidden — admin only")
      );

      const req = new Request("http://localhost/api/admin/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: "dummy" }),
      });

      const res = await adminTgTestPost(req);
      expect(res.status).toBe(403);
    });

    it("returns connection failure gracefully when token is invalid", async () => {
      vi.spyOn(guards, "requireAdmin").mockResolvedValue(mockAdminUser);

      // Mock fetch to simulate Telegram API rejecting invalid token
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ ok: false, description: "Unauthorized" }),
      }) as unknown as typeof fetch;

      try {
        const req = new Request("http://localhost/api/admin/telegram/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botToken: "invalid_mock_token" }),
        });

        const res = await adminTgTestPost(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.connected).toBe(false);
        expect(data.error).toBe("Unauthorized");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("returns bot details when Telegram getMe succeeds", async () => {
      vi.spyOn(guards, "requireAdmin").mockResolvedValue(mockAdminUser);

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            id: 99887766,
            is_bot: true,
            first_name: "KhLan Bot",
            username: "KhLanMarketBot",
            can_join_groups: true,
            can_read_all_group_messages: true,
            supports_inline_queries: false,
          },
        }),
      }) as unknown as typeof fetch;

      try {
        const req = new Request("http://localhost/api/admin/telegram/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botToken: "valid_mock_token" }),
        });

        const res = await adminTgTestPost(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.connected).toBe(true);
        expect(data.botId).toBe(99887766);
        expect(data.botUsername).toBe("KhLanMarketBot");
        expect(data.botName).toBe("KhLan Bot");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("Public Telegram Configuration Endpoint", () => {
    it("returns public destination links without exposing bot token or chat ID", async () => {
      await saveTelegramConfig({
        botUsername: "KhLanPublicBot",
        botToken: "SUPER_SECRET_BOT_TOKEN_DO_NOT_LEAK",
        chatId: "SECRET_CHAT_ID_12345",
        miniAppUrl: "https://t.me/KhLanPublicBot/app",
        channelUrl: "https://t.me/khlan_channel",
        groupUrl: "https://t.me/khlan_group",
        tmaEnabled: true,
        autoAuthEnabled: true,
        leadAlertsEnabled: true,
      });

      const res = await publicTgConfigGet();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.botUsername).toBe("KhLanPublicBot");
      expect(data.miniAppUrl).toBe("https://t.me/KhLanPublicBot/app");
      expect(data.channelUrl).toBe("https://t.me/khlan_channel");
      expect(data.groupUrl).toBe("https://t.me/khlan_group");
      expect(data.tmaEnabled).toBe(true);

      // Verify secrets are strictly stripped
      expect(data.botToken).toBeUndefined();
      expect(data.chatId).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain("SUPER_SECRET");
      expect(JSON.stringify(data)).not.toContain("SECRET_CHAT_ID");
    });
  });
});
