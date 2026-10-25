import { describe, it, expect } from "vitest";
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
  type Locale,
} from "@/lib/i18n";

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
