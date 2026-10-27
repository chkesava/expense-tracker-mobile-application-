import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import {
  cleanGoalName,
  dashboardGoals,
  goalNameKey,
  goalOpeningAmount,
  goalProgress,
  goalStatus,
  goalTab,
  isGoalInProgress,
  isGoalNameTaken,
  isLegacyGoal,
  normalizeGoalName,
  parseGoalAmount,
  sortGoals,
  statusAllowsAmountChange,
  validateGoalName,
  validateNonNegativeAmount,
  validatePositiveAmount,
} from "./goalModel";

const goal = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: "g1",
  name: "Emergency fund",
  targetAmount: 100000,
  currentAmount: 25000,
  ...over,
});

describe("names", () => {
  it("cleans and normalizes case, spacing and unicode width", () => {
    expect(cleanGoalName("  Emergency   Fund  ")).toBe("Emergency Fund");
    expect(normalizeGoalName("  EMERGENCY \t fund ")).toBe("emergency fund");
    // Full-width letters fold under NFKC.
    expect(normalizeGoalName("Ｔｒｉｐ")).toBe("trip");
  });

  it("builds a safe, collision-free document id", () => {
    expect(goalNameKey("Trip / Goa")).toBe("n_trip%20%2F%20goa");
    expect(goalNameKey(".")).toBe("n_.");
    expect(goalNameKey("__x__")).toBe("n___x__");
    expect(goalNameKey(" Emergency Fund")).toBe(goalNameKey("emergency   FUND "));
    expect(goalNameKey("a".repeat(60)).length).toBeLessThan(1500);
  });

  it("validates presence and length", () => {
    expect(validateGoalName("   ")).toEqual(["name_required"]);
    expect(validateGoalName("x".repeat(61))).toEqual(["name_too_long"]);
    expect(validateGoalName("Car")).toEqual([]);
  });

  it("detects duplicates case-insensitively, excluding the goal itself", () => {
    const goals = [goal({ id: "a", name: "Car" }), goal({ id: "b", name: "Trip" })];
    expect(isGoalNameTaken(" car ", goals)).toBe(true);
    expect(isGoalNameTaken("CAR", goals, "a")).toBe(false);
    expect(isGoalNameTaken("Home", goals)).toBe(false);
  });
});

describe("amounts", () => {
  it("rejects non-finite, zero, negative, too large and sub-paisa amounts", () => {
    expect(validatePositiveAmount(Number.NaN)).toEqual(["amount_invalid"]);
    expect(validatePositiveAmount(Number.POSITIVE_INFINITY)).toEqual(["amount_invalid"]);
    expect(validatePositiveAmount("100")).toEqual(["amount_invalid"]);
    expect(validatePositiveAmount(0)).toEqual(["amount_not_positive"]);
    expect(validatePositiveAmount(-5)).toEqual(["amount_not_positive"]);
    expect(validatePositiveAmount(1e9)).toEqual(["amount_too_large"]);
    expect(validatePositiveAmount(10.005)).toEqual(["amount_too_precise"]);
    expect(validatePositiveAmount(10.05)).toEqual([]);
    expect(validatePositiveAmount(100)).toEqual([]);
  });

  it("allows zero only where a starting amount may be zero", () => {
    expect(validateNonNegativeAmount(0)).toEqual([]);
    expect(validateNonNegativeAmount(-1)).toEqual(["amount_not_positive"]);
  });

  it("parses typed amounts", () => {
    expect(parseGoalAmount("1,000.50")).toBe(1000.5);
    expect(parseGoalAmount("₹ 500")).toBe(500);
    expect(parseGoalAmount("-5")).toBeNaN();
    expect(parseGoalAmount("1e3")).toBeNaN();
    expect(parseGoalAmount("")).toBeNaN();
  });
});

describe("legacy documents and status", () => {
  it("treats a goal without schemaVersion as legacy and active", () => {
    const legacy = goal();
    expect(isLegacyGoal(legacy)).toBe(true);
    expect(goalStatus(legacy)).toBe("active");
    expect(goalStatus(goal({ status: "bogus" as never }))).toBe("active");
    expect(isLegacyGoal(goal({ schemaVersion: 2 }))).toBe(false);
  });

  it("uses the whole saved amount as the opening amount of a legacy goal", () => {
    expect(goalOpeningAmount(goal())).toBe(25000);
    expect(goalOpeningAmount(goal({ schemaVersion: 2, openingAmount: 1000 }))).toBe(1000);
    expect(goalOpeningAmount(goal({ schemaVersion: 2 }))).toBe(0);
  });

  it("only active and paused goals accept amount changes", () => {
    expect(statusAllowsAmountChange("active")).toBe(true);
    expect(statusAllowsAmountChange("paused")).toBe(true);
    expect(statusAllowsAmountChange("completed")).toBe(false);
    expect(statusAllowsAmountChange("archived")).toBe(false);
    expect(statusAllowsAmountChange("cancelled")).toBe(false);
  });

  it("maps statuses to tabs without treating closed goals as active", () => {
    expect(goalTab(goal())).toBe("active");
    expect(goalTab(goal({ status: "paused" }))).toBe("active");
    expect(goalTab(goal({ status: "completed" }))).toBe("completed");
    expect(goalTab(goal({ status: "archived" }))).toBe("archived");
    expect(goalTab(goal({ status: "cancelled" }))).toBe("archived");
    expect(isGoalInProgress(goal({ status: "cancelled" }))).toBe(false);
    expect(isGoalInProgress(goal({ status: "paused" }))).toBe(true);
  });
});

describe("progress", () => {
  it("computes saved, remaining and percent", () => {
    expect(goalProgress(goal())).toEqual({ saved: 25000, target: 100000, remaining: 75000, surplus: 0, percent: 25, reached: false });
  });

  it("shows surplus separately and caps percent at 100", () => {
    expect(goalProgress(goal({ currentAmount: 120000 }))).toEqual({ saved: 120000, target: 100000, remaining: 0, surplus: 20000, percent: 100, reached: true });
  });

  it("never rounds a not-quite-reached goal up to 100%", () => {
    expect(goalProgress(goal({ currentAmount: 99999 })).percent).toBe(99.9);
  });

  it("survives corrupt values", () => {
    expect(goalProgress(goal({ currentAmount: Number.NaN, targetAmount: 0 }))).toEqual({ saved: 0, target: 0, remaining: 0, surplus: 0, percent: 0, reached: false });
  });
});

describe("dashboardGoals", () => {
  it("shows only in-progress goals, pinned first, and counts them", () => {
    const goals = [
      goal({ id: "a", sortOrder: 1 }),
      goal({ id: "b", sortOrder: 2, pinned: true }),
      goal({ id: "c", sortOrder: 0, status: "completed" }),
      goal({ id: "d", sortOrder: 0, status: "archived" }),
      goal({ id: "e", sortOrder: 3, status: "paused" }),
      goal({ id: "f", sortOrder: 0, status: "cancelled" }),
    ];
    const { shown, total } = dashboardGoals(goals, 2);
    expect(shown.map((g) => g.id)).toEqual(["b", "a"]);
    expect(total).toBe(3);
  });
});

describe("sorting", () => {
  const goals = [
    goal({ id: "a", name: "Zeta", targetAmount: 1000, currentAmount: 900, createdAtMs: 3, sortOrder: 30 }),
    goal({ id: "b", name: "alpha", targetAmount: 5000, currentAmount: 500, createdAtMs: 1, sortOrder: 10 }),
    goal({ id: "c", name: "Mid", targetAmount: 2000, currentAmount: 1000, createdAtMs: 2, sortOrder: 20, pinned: true }),
  ];
  const ids = (sort: Parameters<typeof sortGoals>[1]) => sortGoals(goals, sort).map((g) => g.id);

  it("puts pinned goals first, then sorts", () => {
    expect(ids("manual")).toEqual(["c", "b", "a"]);
    expect(ids("created")).toEqual(["c", "b", "a"]);
    expect(ids("progress")).toEqual(["c", "a", "b"]);
    expect(ids("remaining")).toEqual(["c", "a", "b"]);
    expect(ids("name")).toEqual(["c", "b", "a"]);
    expect(ids("target")).toEqual(["c", "b", "a"]);
  });

  it("falls back to the legacy createdAt timestamp", () => {
    const legacy = [
      goal({ id: "x", createdAt: { seconds: 20 } }),
      goal({ id: "y", createdAt: { toMillis: () => 10_000 } }),
    ];
    expect(sortGoals(legacy, "created").map((g) => g.id)).toEqual(["y", "x"]);
  });
});
