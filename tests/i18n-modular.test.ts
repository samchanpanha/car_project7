import { describe, it, expect, vi } from "vitest";
import {
  isLocale,
  LOCALES,
  LOCALE_NAMES,
  LOCALE_SHORT,
  dictionaries,
  translate,
  bodyTypeLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
  partConditionLabels,
  partTargetLabels,
  fuelLabels,
  transmissionLabels,
  drivetrainLabels,
  localizeRealtimeNotification,
  type Locale,
} from "@/lib/i18n";
import { createMarketingMetadata } from "@/lib/i18n/marketing-metadata";
import { useAppStore } from "@/lib/store";

describe("Modular i18n System Tests", () => {
  it("validates locales and guards correctly", () => {
    expect(LOCALES).toEqual(["en", "km", "zh", "vi"]);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("km")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("provides locale names and short triggers for all locales", () => {
    for (const loc of LOCALES) {
      expect(LOCALE_NAMES[loc]).toBeDefined();
      expect(typeof LOCALE_NAMES[loc]).toBe("string");
      expect(LOCALE_SHORT[loc]).toBeDefined();
      expect(typeof LOCALE_SHORT[loc]).toBe("string");
    }
  });

  it("contains matching key counts across all dictionaries", () => {
    const enKeys = Object.keys(dictionaries.en);
    const kmKeys = Object.keys(dictionaries.km);
    const zhKeys = Object.keys(dictionaries.zh);
    const viKeys = Object.keys(dictionaries.vi);

    expect(enKeys.length).toBeGreaterThan(700);
    expect(kmKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(viKeys.length).toBe(enKeys.length);

    // Ensure motor and spare parts keys exist in all locales
    const expectedKeys = [
      "categoryCars",
      "categoryMotors",
      "categorySpareParts",
      "partTarget",
      "partCategoryLabel",
      "partConditionLabel",
      "compatibleModelsLabel",
      "partNumberLabel",
      "sparePartsProRequired",
      "motorBodyType",
      "engineDisplacement",
    ] as const;

    for (const k of expectedKeys) {
      for (const loc of LOCALES) {
        expect(dictionaries[loc][k]).toBeDefined();
        expect(dictionaries[loc][k].length).toBeGreaterThan(0);
      }
    }
  });

  it("translates strings and replaces template variables accurately", () => {
    expect(translate("en", "appName")).toBe("KhLan");
    expect(translate("km", "appName")).toBe("ឡាន");

    const templateResult = translate("en", "subRenews", { d: "2026-12-31" });
    expect(templateResult).toContain("2026-12-31");
  });

  it("keeps recent-feature translations complete, well-formed, and placeholder-compatible", () => {
    const recentKeys = [
      "notificationGenericTitle",
      "notificationGenericBody",
      "realtimeSubscriptionFallback",
      "realtimeBuyerFallback",
      "realtimeSavedSearchFallback",
      "realtimeSubscriptionActivatedTitle",
      "realtimeSubscriptionActivatedBody",
      "realtimePaymentRejectedTitle",
      "realtimePaymentRejectedBody",
      "realtimePaymentRejectedReason",
      "realtimeTelegramLinkedTitle",
      "realtimeTelegramLinkedBody",
      "realtimeAppointmentCreatedTitle",
      "realtimeAppointmentCreatedBody",
      "realtimeSavedSearchMatchTitle",
      "realtimeSavedSearchMatchBody",
      "realtimePurchaseFollowupTitle",
      "realtimePurchaseFollowupBody",
      "realtimeAppointmentFollowupTitle",
      "realtimeAppointmentFollowupBody",
      "realtimeTestNotificationTitle",
      "realtimeTestNotificationBody",
      "metaEvTitle",
      "metaEvDescription",
      "metaFinancingTitle",
      "metaFinancingDescription",
      "metaTrustTitle",
      "metaTrustDescription",
    ] as const;

    const placeholders = (value: string) => (value.match(/\{[^{}]+\}/g) ?? []).sort();

    for (const key of recentKeys) {
      const englishPlaceholders = placeholders(dictionaries.en[key]);
      for (const locale of LOCALES) {
        const value = dictionaries[locale][key];
        expect(value.trim(), `${locale}.${key} must not be empty`).not.toBe("");
        expect(value, `${locale}.${key} must not contain a replacement character`).not.toContain("\uFFFD");
        expect(placeholders(value), `${locale}.${key} placeholders must match English`).toEqual(englishPlaceholders);
      }
    }

    for (const value of Object.values(dictionaries.km)) {
      expect(value).not.toContain("\uFFFD");
    }
  });

  it("keeps every locale non-empty and preserves English interpolation placeholders", () => {
    const keys = Object.keys(dictionaries.en) as Array<keyof typeof dictionaries.en>;
    const placeholders = (value: string) => (value.match(/\{[^{}]+\}/g) ?? []).sort();

    for (const key of keys) {
      const englishPlaceholders = placeholders(dictionaries.en[key]);
      for (const locale of LOCALES) {
        const value = dictionaries[locale][key];
        expect(value.trim(), `${locale}.${key} must not be empty`).not.toBe("");
        expect(value, `${locale}.${key} must not contain a replacement character`).not.toContain("\uFFFD");
        expect(placeholders(value), `${locale}.${key} placeholders must match English`).toEqual(englishPlaceholders);
      }
    }
  });

  it("localizes every supported realtime notification and preserves its dynamic details", () => {
    const events = [
      { type: "SUBSCRIPTION_ACTIVATED", payload: { plan: "PRO" } },
      { type: "PAYMENT_REJECTED", payload: { reason: "Receipt mismatch" } },
      { type: "TELEGRAM_LINKED" },
      {
        type: "APPOINTMENT_CREATED",
        payload: { buyerName: "Dara", vehicleYear: 2022, vehicleMake: "Toyota", vehicleModel: "Prado" },
      },
      {
        type: "SAVED_SEARCH_MATCH",
        payload: { searchName: "Family SUV", year: 2023, make: "Honda", model: "CR-V" },
      },
      { type: "LEAD_FOLLOWUP", payload: { leadType: "PURCHASE_REQUEST" } },
      { type: "LEAD_FOLLOWUP", payload: { leadType: "APPOINTMENT" } },
      { type: "TEST_NOTIFICATION" },
    ];

    for (const locale of LOCALES) {
      for (const event of events) {
        const localized = localizeRealtimeNotification(locale, event);
        expect(localized?.title).toBeTruthy();
        expect(localized?.message).toBeTruthy();
      }

      expect(
        localizeRealtimeNotification(locale, {
          type: "APPOINTMENT_CREATED",
          payload: { buyerName: "Dara", vehicleYear: 2022, vehicleMake: "Toyota", vehicleModel: "Prado" },
        })?.message,
      ).toContain("Dara");
      expect(
        localizeRealtimeNotification(locale, {
          type: "APPOINTMENT_CREATED",
          payload: { buyerName: "Dara", vehicleYear: 2022, vehicleMake: "Toyota", vehicleModel: "Prado" },
        })?.message,
      ).toContain("Prado");
    }

    expect(localizeRealtimeNotification("en", { type: "CONNECTED" })).toBeNull();
    expect(localizeRealtimeNotification("en", { type: "PING" })).toBeNull();
  });

  it("uses the selected locale for marketing route metadata without changing canonical paths", () => {
    const pages = [
      { page: "ev", path: "/ev", titleKey: "metaEvTitle", descriptionKey: "metaEvDescription" },
      {
        page: "financing",
        path: "/financing",
        titleKey: "metaFinancingTitle",
        descriptionKey: "metaFinancingDescription",
      },
      { page: "trust", path: "/trust", titleKey: "metaTrustTitle", descriptionKey: "metaTrustDescription" },
    ] as const;

    for (const { page, path, titleKey, descriptionKey } of pages) {
      const canonical = createMarketingMetadata("en", page).alternates?.canonical;
      for (const locale of LOCALES) {
        const metadata = createMarketingMetadata(locale, page);
        expect(metadata.title).toContain(translate(locale, titleKey));
        expect(metadata.description).toBe(translate(locale, descriptionKey));
        expect(metadata.openGraph?.description).toBe(translate(locale, descriptionKey));
        expect(metadata.alternates?.canonical).toBe(canonical);
        expect(canonical).toContain(path);
      }
    }
  });

  it("persists the selected locale in a server-readable cookie", () => {
    const cookieDocument = { cookie: "" };
    vi.stubGlobal("window", {
      localStorage: { setItem: vi.fn() },
      location: { protocol: "https:" },
    });
    vi.stubGlobal("document", cookieDocument);

    try {
      useAppStore.getState().setLocale("zh");
      expect(cookieDocument.cookie).toContain("khlan_locale=zh");
      expect(cookieDocument.cookie).toContain("Path=/");
      expect(cookieDocument.cookie).toContain("SameSite=Lax");
      expect(cookieDocument.cookie).toContain("Secure");
    } finally {
      useAppStore.getState().setLocale("en");
      vi.unstubAllGlobals();
    }
  });

  it("provides complete label maps across all 4 locales", () => {
    const labelMaps = [
      bodyTypeLabels,
      motorBodyTypeLabels,
      partCategoryLabels,
      partConditionLabels,
      partTargetLabels,
      fuelLabels,
      transmissionLabels,
      drivetrainLabels,
    ];

    for (const map of labelMaps) {
      const keys = Object.keys(map);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        for (const loc of LOCALES) {
          expect(map[key][loc]).toBeDefined();
          expect(typeof map[key][loc]).toBe("string");
        }
      }
    }
  });
});
