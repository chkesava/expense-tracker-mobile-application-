import { describe, expect, it } from "vitest";

import { DEFAULT_VAULT_COLOR, VAULT_COLORS } from "../types/vault";
import { budgetProgressTier, type BudgetProgressTier } from "./spaceMath";
import { spaceBudgetLeftText, spaceBudgetPresentation, vaultBudgetPresentation } from "./vaultSpacePresentation";

describe("vaultBudgetPresentation", () => {
  it("gives every vault status a word and a matching tone", () => {
    expect(vaultBudgetPresentation("healthy")).toEqual({ status: "good", tone: "positive", label: "On track" });
    expect(vaultBudgetPresentation("warning")).toEqual({ status: "watch", tone: "warning", label: "Nearly at budget" });
    expect(vaultBudgetPresentation("exceeded")).toEqual({ status: "over", tone: "negative", label: "Over budget" });
  });
});

describe("spaceBudgetPresentation", () => {
  const tiers: BudgetProgressTier[] = ["none", "safe", "warning", "danger", "over"];

  it("labels every tier, so status never relies on colour alone", () => {
    const labels = tiers.map((t) => spaceBudgetPresentation(t).label);
    expect(new Set(labels).size).toBe(tiers.length);
    labels.forEach((label) => expect(label.length).toBeGreaterThan(0));
  });

  it("follows the spaceMath thresholds", () => {
    expect(spaceBudgetPresentation(budgetProgressTier(50, true)).status).toBe("good");
    expect(spaceBudgetPresentation(budgetProgressTier(80, true)).label).toBe("Watch spending");
    expect(spaceBudgetPresentation(budgetProgressTier(95, true)).label).toBe("Nearly at budget");
    expect(spaceBudgetPresentation(budgetProgressTier(120, true)).status).toBe("over");
    expect(spaceBudgetPresentation(budgetProgressTier(0, false)).status).toBe("neutral");
  });
});

describe("spaceBudgetLeftText", () => {
  const money = (v: number) => `₹${v}`;
  it("says left or over, never a bare or negative number", () => {
    expect(spaceBudgetLeftText(1200, money)).toBe("₹1200 left");
    expect(spaceBudgetLeftText(0, money)).toBe("₹0 left");
    expect(spaceBudgetLeftText(-300, money)).toBe("₹300 over");
  });

  it("goes through the formatter, so ghost mode masks it", () => {
    expect(spaceBudgetLeftText(-300, () => "••••••")).toBe("•••••• over");
  });
});

describe("vault palette", () => {
  it("keeps the stored colours and their default unchanged", () => {
    // These are saved on vaults (themeColor): changing them would change user data.
    expect(VAULT_COLORS[0]).toBe("#6366F1");
    expect(DEFAULT_VAULT_COLOR).toBe("#6366F1");
    expect(VAULT_COLORS).toHaveLength(8);
  });
});
