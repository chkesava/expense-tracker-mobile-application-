import { describe, expect, it } from "vitest";
import { CORE_NAV_ITEMS, isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches home/dashboard paths", () => {
    expect(isNavItemActive("/dashboard", "home")).toBe(true);
    expect(isNavItemActive("/(app)/dashboard", "home")).toBe(true);
    expect(isNavItemActive("/", "home")).toBe(true);
    expect(isNavItemActive("/(app)", "home")).toBe(true);
    expect(isNavItemActive("/ledger", "home")).toBe(false);
  });

  it("matches ledger and sub-routes", () => {
    expect(isNavItemActive("/ledger", "ledger")).toBe(true);
    expect(isNavItemActive("/(app)/ledger", "ledger")).toBe(true);
    expect(isNavItemActive("/expenses", "ledger")).toBe(true);
    expect(isNavItemActive("/(app)/subscriptions", "ledger")).toBe(true);
    expect(isNavItemActive("/cards", "ledger")).toBe(true);
  });

  it("matches vaults", () => {
    expect(isNavItemActive("/vaults", "vaults")).toBe(true);
    expect(isNavItemActive("/(app)/vaults", "vaults")).toBe(true);
    expect(isNavItemActive("/dashboard", "vaults")).toBe(false);
  });

  it("matches insights", () => {
    expect(isNavItemActive("/insights", "insights")).toBe(true);
    expect(isNavItemActive("/(app)/insights", "insights")).toBe(true);
    expect(isNavItemActive("/analytics", "insights")).toBe(true);
  });

  it("matches settings", () => {
    expect(isNavItemActive("/settings", "settings")).toBe(true);
    expect(isNavItemActive("/(app)/settings", "settings")).toBe(true);
  });

  it("keeps ledger as the internal route and shows Transactions", () => {
    const ledger = CORE_NAV_ITEMS.find((item) => item.id === "ledger");
    expect(ledger?.path).toBe("/ledger");
    expect(ledger?.label).toBe("Transactions");
    expect(ledger?.mobileLabel).toBe("Transactions");
  });

  it("matches admin", () => {
    expect(isNavItemActive("/admin", "admin")).toBe(true);
    expect(isNavItemActive("/(app)/admin", "admin")).toBe(true);
  });
});
