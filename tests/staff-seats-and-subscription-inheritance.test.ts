import { describe, it, expect } from "vitest";
import { canManageTenant, canWriteTenant } from "@/lib/api/guards";

describe("Staff Seat Role Guard Boundaries", () => {
  it("allows OWNER and MANAGER to manage staff and subscriptions", () => {
    expect(canManageTenant("OWNER")).toBe(true);
    expect(canManageTenant("MANAGER")).toBe(true);
    expect(canManageTenant("SALES_STAFF")).toBe(false);
    expect(canManageTenant("INVENTORY_MANAGER")).toBe(false);
  });

  it("allows OWNER, MANAGER, and INVENTORY_MANAGER to write tenant inventory", () => {
    expect(canWriteTenant("OWNER")).toBe(true);
    expect(canWriteTenant("MANAGER")).toBe(true);
    expect(canWriteTenant("INVENTORY_MANAGER")).toBe(true);
    expect(canWriteTenant("SALES_STAFF")).toBe(false);
  });
});