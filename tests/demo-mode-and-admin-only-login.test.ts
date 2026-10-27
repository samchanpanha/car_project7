import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/platform-settings";
import { DEFAULT_SUPER_ADMIN } from "@/lib/bootstrap";

describe("Demo Mode Display & Admin-Only Login Defaults", () => {
  it("defaults strictly to demoModeEnabled=false and adminOnlyLogin=true", () => {
    expect(DEFAULT_SETTINGS.demoModeEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.adminOnlyLogin).toBe(true);
  });

  it("defines the default super admin identity", () => {
    expect(DEFAULT_SUPER_ADMIN.id).toBe("usr_admin");
    expect(DEFAULT_SUPER_ADMIN.phone).toBe("+85512998009");
    expect(DEFAULT_SUPER_ADMIN.name).toBe("Nita Meng");
  });
});