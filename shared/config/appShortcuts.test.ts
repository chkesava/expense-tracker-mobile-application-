import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNTS_SHORTCUT_HREF,
  APP_SHORTCUT_IDS,
  listSpendlyShortcuts,
  resolveShortcutAction,
  SHORTCUT_FALLBACK_HREF,
  shouldRegisterSpendlyShortcuts,
  SPENDLY_SHORTCUTS,
} from "./appShortcuts";

function pluginIosActionIds(plugins: unknown): string[] {
  if (!Array.isArray(plugins)) return [];
  for (const entry of plugins) {
    if (!Array.isArray(entry) || entry[0] !== "expo-quick-actions") continue;
    const iosActions = (entry[1] as { iosActions?: { id?: string }[] })
      ?.iosActions;
    return (iosActions ?? []).map((action) => action.id).filter(Boolean) as string[];
  }
  return [];
}

describe("shouldRegisterSpendlyShortcuts", () => {
  it("registers on the combined production build and expense-only builds", () => {
    expect(shouldRegisterSpendlyShortcuts(null)).toBe(true);
    expect(shouldRegisterSpendlyShortcuts("expense")).toBe(true);
  });

  it("does not register on nutrition or ganesh-only builds", () => {
    expect(shouldRegisterSpendlyShortcuts("nutrition")).toBe(false);
    expect(shouldRegisterSpendlyShortcuts("ganesh")).toBe(false);
  });
});

describe("listSpendlyShortcuts", () => {
  it("keeps four actions when receipt capture is supported", () => {
    const ids = listSpendlyShortcuts({ enableAIFeatures: true }).map((item) => item.id);
    expect(ids).toEqual([...APP_SHORTCUT_IDS]);
  });

  it("hides the receipt action when AI features are off", () => {
    const ids = listSpendlyShortcuts({ enableAIFeatures: false }).map((item) => item.id);
    expect(ids).toEqual(["expense.add", "income.add", "accounts.open"]);
  });

  it("never exposes a QR or payment shortcut", () => {
    const ids = listSpendlyShortcuts({ enableAIFeatures: true }).map((item) => item.id);
    expect(ids).not.toContain("qr.open");
  });
});

describe("resolveShortcutAction", () => {
  it("opens the existing add-expense modal", () => {
    expect(resolveShortcutAction("expense.add", { enableAIFeatures: true })).toEqual({
      id: "expense.add",
      kind: "open-add",
      transactionKind: "expense",
      openReceipt: false,
      destination: "add-expense",
      result: "success",
    });
  });

  it("opens the existing add-income modal", () => {
    expect(resolveShortcutAction("income.add", { enableAIFeatures: true })).toEqual({
      id: "income.add",
      kind: "open-add",
      transactionKind: "income",
      openReceipt: false,
      destination: "add-income",
      result: "success",
    });
  });

  it("opens add-expense plus the receipt scanner when AI is on", () => {
    expect(resolveShortcutAction("receipt.add", { enableAIFeatures: true })).toEqual({
      id: "receipt.add",
      kind: "open-add",
      transactionKind: "expense",
      openReceipt: true,
      destination: "add-receipt",
      result: "success",
    });
  });

  it("falls back to add-expense when a stale receipt shortcut is tapped with AI off", () => {
    expect(resolveShortcutAction("receipt.add", { enableAIFeatures: false })).toEqual({
      id: "receipt.add",
      kind: "open-add",
      transactionKind: "expense",
      openReceipt: false,
      destination: "add-expense",
      result: "fallback",
    });
  });

  it("routes accounts to the ledger accounts tab, not /accounts", () => {
    expect(resolveShortcutAction("accounts.open", { enableAIFeatures: true })).toEqual({
      id: "accounts.open",
      kind: "navigate",
      href: ACCOUNTS_SHORTCUT_HREF,
      destination: "accounts",
      result: "success",
    });
    expect(ACCOUNTS_SHORTCUT_HREF).toBe("/ledger?tab=accounts");
  });

  it("falls back to the dashboard for unknown ids", () => {
    expect(resolveShortcutAction("qr.open", { enableAIFeatures: true })).toEqual({
      id: "qr.open",
      kind: "navigate",
      href: SHORTCUT_FALLBACK_HREF,
      destination: "dashboard",
      result: "fallback",
    });
    expect(resolveShortcutAction("not.a.thing", { enableAIFeatures: true }).result).toBe(
      "fallback"
    );
  });
});

describe("native plugin ids stay in sync with the contract", () => {
  it("app.json static iOS actions use the same four ids", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "app.json"), "utf8")
    );
    expect(pluginIosActionIds(appJson.expo.plugins)).toEqual([...APP_SHORTCUT_IDS]);
  });

  it("expense-only extraPlugins use the same four ids", () => {
    const expense = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "products", "expense.json"), "utf8")
    );
    expect(pluginIosActionIds(expense.extraPlugins)).toEqual([...APP_SHORTCUT_IDS]);
  });

  it("does not put expo-quick-actions on SHARED_PLUGINS (would leak into nutrition/ganesh)", () => {
    const config = fs.readFileSync(
      path.join(__dirname, "..", "..", "app.config.js"),
      "utf8"
    );
    const sharedBlock = config.slice(
      config.indexOf("const SHARED_PLUGINS"),
      config.indexOf("function splashScreenPlugin")
    );
    expect(sharedBlock).not.toContain("expo-quick-actions");
  });

  it("nutrition and ganesh-only builds do not ship the Spendly plugin", () => {
    for (const product of ["nutrition", "ganesh"] as const) {
      const json = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "..", "products", `${product}.json`), "utf8")
      );
      const extra = JSON.stringify(json.extraPlugins ?? []);
      expect(extra).not.toContain("expo-quick-actions");
    }
  });

  it("contract titles stay short and decoupled from ids", () => {
    for (const shortcut of SPENDLY_SHORTCUTS) {
      expect(shortcut.title.length).toBeLessThanOrEqual(16);
      expect(shortcut.id).not.toBe(shortcut.title);
    }
  });
});
