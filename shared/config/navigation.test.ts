import { describe, expect, it } from "vitest";
import {
  CORE_NAV_ITEMS,
  isNavItemActive,
  resolveAndroidBackAction,
  resolveLegacyLedgerTabRoute,
} from "./navigation";

describe("resolveAndroidBackAction", () => {
  it("asks for exit confirmation on the start destination", () => {
    expect(resolveAndroidBackAction("/dashboard")).toBe("exit");
    expect(resolveAndroidBackAction("/(app)/dashboard")).toBe("exit");
    expect(resolveAndroidBackAction("/")).toBe("exit");
  });

  it("pops out of stack sub-screens", () => {
    expect(resolveAndroidBackAction("/settings")).toBe("pop");
    expect(resolveAndroidBackAction("/sms-inbox")).toBe("pop");
    expect(resolveAndroidBackAction("/app-selector")).toBe("pop");
    expect(resolveAndroidBackAction("/accounts/abc123")).toBe("pop");
  });

  it("pops out of screens that used to fall through to the navigator", () => {
    // `/add` and a bill detail reached from a deep link had no rule, so back
    // could exit the app instead of returning to the shell.
    expect(resolveAndroidBackAction("/add")).toBe("pop");
    expect(resolveAndroidBackAction("/credit-card-bills/bill-1")).toBe("pop");
  });

  it("returns to the start destination from secondary tabs", () => {
    expect(resolveAndroidBackAction("/ledger")).toBe("home");
    expect(resolveAndroidBackAction("/ledger?tab=subscriptions")).toBe("home");
    expect(resolveAndroidBackAction("/vaults")).toBe("home");
    expect(resolveAndroidBackAction("/vaults?tab=splits")).toBe("home");
    expect(resolveAndroidBackAction("/investments")).toBe("home");
    expect(resolveAndroidBackAction("/investments?tab=sip")).toBe("home");
    expect(resolveAndroidBackAction("/insights")).toBe("home");
  });

  it("defers to the navigator for anything unrecognised", () => {
    expect(resolveAndroidBackAction("/some-future-screen")).toBe("default");
  });
});

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
    expect(isNavItemActive("/vaults?tab=splits", "vaults")).toBe(true);
    expect(isNavItemActive("/dashboard", "vaults")).toBe(false);
  });

  it("matches investments and does not treat it as ledger", () => {
    expect(isNavItemActive("/investments", "investments")).toBe(true);
    expect(isNavItemActive("/(app)/investments", "investments")).toBe(true);
    expect(isNavItemActive("/investments?tab=portfolio", "investments")).toBe(true);
    expect(isNavItemActive("/investments", "ledger")).toBe(false);
    expect(isNavItemActive("/ledger", "investments")).toBe(false);
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

  it("exposes investments as a feature-flagged bottom-nav hub", () => {
    const investments = CORE_NAV_ITEMS.find((item) => item.id === "investments");
    expect(investments?.path).toBe("/investments");
    expect(investments?.label).toBe("Investments");
    expect(investments?.includeInBottomNav).toBe(true);
    expect(investments?.requiresInvestmentsFeature).toBe(true);
  });

  it("remaps legacy ledger tabs onto the vaults and investments hubs", () => {
    expect(resolveLegacyLedgerTabRoute("splits")).toBe("/vaults?tab=splits");
    expect(resolveLegacyLedgerTabRoute("spaces")).toBe("/vaults?tab=spaces");
    expect(resolveLegacyLedgerTabRoute("travel")).toBe("/vaults?tab=travel");
    expect(resolveLegacyLedgerTabRoute("collect")).toBe("/vaults?tab=collect");
    expect(resolveLegacyLedgerTabRoute("investments")).toBe("/investments");
    expect(resolveLegacyLedgerTabRoute("portfolio")).toBe("/investments?tab=portfolio");
    expect(resolveLegacyLedgerTabRoute("sip")).toBe("/investments?tab=sip");
    expect(resolveLegacyLedgerTabRoute("subscriptions")).toBe(null);
    expect(resolveLegacyLedgerTabRoute(undefined)).toBe(null);
  });

  it("matches admin", () => {
    expect(isNavItemActive("/admin", "admin")).toBe(true);
    expect(isNavItemActive("/(app)/admin", "admin")).toBe(true);
  });
});
