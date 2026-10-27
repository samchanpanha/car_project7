import { describe, it, expect } from "vitest";
import { parseTmaDeepLink } from "@/lib/telegram";
import { DEFAULT_TELEGRAM_CONFIG, TELEGRAM_CONFIG_KEY } from "@/lib/telegram-config";

describe("Telegram Mini App Deep-Link Parser", () => {
  it("routes vehicle and spare part deep links to detail view", () => {
    expect(parseTmaDeepLink("vehicle_veh_prado_2018")).toEqual({ name: "detail", vehicleId: "veh_prado_2018" });
    expect(parseTmaDeepLink("veh_rx300_2020")).toEqual({ name: "detail", vehicleId: "veh_rx300_2020" });
    expect(parseTmaDeepLink("part_brake_prius")).toEqual({ name: "detail", vehicleId: "part_brake_prius" });
  });

  it("routes seller profile deep links to storefront", () => {
    expect(parseTmaDeepLink("seller_usr_nita")).toEqual({ name: "seller", userId: "usr_nita" });
    expect(parseTmaDeepLink("usr_dealer_top")).toEqual({ name: "seller", userId: "usr_dealer_top" });
  });

  it("routes AI report deep links", () => {
    expect(parseTmaDeepLink("report_veh_prado_2018")).toEqual({ name: "report", vehicleId: "veh_prado_2018" });
  });

  it("routes browse queries with URI decoding", () => {
    expect(parseTmaDeepLink("browse_Toyota%20Prius")).toEqual({ name: "browse", q: "Toyota Prius" });
  });

  it("returns null for unrecognized params", () => {
    expect(parseTmaDeepLink(null)).toBeNull();
    expect(parseTmaDeepLink("")).toBeNull();
    expect(parseTmaDeepLink("random_unknown_param")).toBeNull();
  });
});

describe("Telegram Configuration Defaults", () => {
  it("exposes the platform configuration key", () => {
    expect(TELEGRAM_CONFIG_KEY).toBe("telegram.platformConfig");
  });

  it("contains the default bot identity", () => {
    expect(DEFAULT_TELEGRAM_CONFIG.botUsername).toBe("KhLanBot");
    expect(DEFAULT_TELEGRAM_CONFIG.tmaEnabled).toBe(true);
  });
});