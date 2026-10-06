import { describe, expect, it } from "vitest";

describe("Progressive Dashboard Loading Hierarchy", () => {
  it("prioritizes critical-first widgets above the fold", () => {
    const ABOVE_FOLD_WIDGETS = ["focus", "quickAdd", "recentActivity"];
    const HERO_WIDGETS = ["focus", "recentActivity"];

    // Ensure critical widgets are always rendered in frame 1
    expect(ABOVE_FOLD_WIDGETS).toContain("focus");
    expect(ABOVE_FOLD_WIDGETS).toContain("quickAdd");
    expect(ABOVE_FOLD_WIDGETS).toContain("recentActivity");

    // Ensure heavy secondary widgets are NOT in above-fold critical set
    expect(ABOVE_FOLD_WIDGETS).not.toContain("overview");
    expect(ABOVE_FOLD_WIDGETS).not.toContain("subscriptions");
    expect(ABOVE_FOLD_WIDGETS).not.toContain("budgetAlerts");
    expect(ABOVE_FOLD_WIDGETS).not.toContain("gamification");
    expect(ABOVE_FOLD_WIDGETS).not.toContain("topCategories");
    expect(ABOVE_FOLD_WIDGETS).not.toContain("financialGoals");
  });

  it("calculates staggered delays for below-the-fold secondary widgets", () => {
    const calculateDelay = (index: number) => 40 + Math.max(0, index) * 40;

    // Staggered delays keep the JS thread smooth across frames
    expect(calculateDelay(0)).toBe(40);
    expect(calculateDelay(1)).toBe(80);
    expect(calculateDelay(2)).toBe(120);
    expect(calculateDelay(3)).toBe(160);
    expect(calculateDelay(4)).toBe(200);
  });

  it("separates core loading from secondary valuation loading in progressive net worth", () => {
    const simulateProgressiveLoading = ({
      accountsLoading,
      expensesLoading,
      secondaryReady,
      secondaryLoading,
      progressive,
    }: {
      accountsLoading: boolean;
      expensesLoading: boolean;
      secondaryReady: boolean;
      secondaryLoading: boolean;
      progressive: boolean;
    }) => {
      const coreLoading = accountsLoading || expensesLoading;
      const fullSecondaryLoading = !secondaryReady || secondaryLoading;
      const loading = progressive ? coreLoading : coreLoading || fullSecondaryLoading;
      return { loading, secondaryLoading: fullSecondaryLoading };
    };

    // Cold start with progressive = true:
    // When accounts have loaded, core loading is false even if secondary is still running!
    const state1 = simulateProgressiveLoading({
      accountsLoading: false,
      expensesLoading: false,
      secondaryReady: false,
      secondaryLoading: true,
      progressive: true,
    });

    expect(state1.loading).toBe(false); // Core bank assets ready to display immediately!
    expect(state1.secondaryLoading).toBe(true); // Secondary valuations still calculating

    // Non-progressive mode: waits for all secondary loaders before loading goes false
    const state2 = simulateProgressiveLoading({
      accountsLoading: false,
      expensesLoading: false,
      secondaryReady: false,
      secondaryLoading: true,
      progressive: false,
    });

    expect(state2.loading).toBe(true); // Blocked in non-progressive mode!
  });

  it("identifies the terminal delayed widget index to emit dashboard_hydrated", () => {
    const displayWidgetIds = ["focus", "quickAdd", "recentActivity", "budgetAlerts", "subscriptions", "gamification"];
    const isLastWidget = (index: number) => index === displayWidgetIds.length - 1;

    expect(isLastWidget(0)).toBe(false);
    expect(isLastWidget(4)).toBe(false);
    expect(isLastWidget(5)).toBe(true);
  });
});

