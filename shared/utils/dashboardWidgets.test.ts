import { describe, expect, it } from "vitest";
import type { Expense } from "@/shared/types/expense";
import type { DashboardWidgets } from "@/shared/types/settings";
import { SETTINGS_DEFAULTS } from "@/shared/types/settings";
import {
  computeActiveCategoryBudgets,
  computeDailySpendingPace,
  computeTopCategories,
  DEFAULT_DASHBOARD_ORDER,
  getOrderedDashboardWidgets,
  budgetProgressSummary,
  getMoreDashboardWidgets,
  KNOWN_DASHBOARD_WIDGETS,
  spendingBreakdown,
  topCategoryShares,
  type CategoryBudgetAlertItem,
} from "./dashboardWidgets";

describe("dashboardWidgets utilities", () => {
  describe("getOrderedDashboardWidgets", () => {
    it("returns the control-center default order when order is undefined", () => {
      const widgets = getOrderedDashboardWidgets(undefined, undefined, true);
      expect(widgets).toEqual([
        "focus",
        "budgetAlerts",
        "subscriptions",
        "topCategories",
        "overview",
        "financialGoals",
        "recentActivity",
        "gamification",
        "quickAdd",
      ]);
      expect(widgets).not.toContain("insight");
      expect(widgets).not.toContain("investments");
      expect(KNOWN_DASHBOARD_WIDGETS).toContain("insight");
    });

    it("keeps settings defaults aligned with the control-center order", () => {
      expect(SETTINGS_DEFAULTS.dashboardOrder).toEqual([...DEFAULT_DASHBOARD_ORDER]);
    });

    it("respects custom order and filters out unknown keys safely", () => {
      const customOrder = [
        "recentActivity",
        "unknownWidget123",
        "overview",
        "budgetAlerts",
        "nonExistent",
      ];
      const widgets = getOrderedDashboardWidgets(customOrder, undefined, true);
      expect(widgets).toEqual(["recentActivity", "overview", "budgetAlerts"]);
    });

    it("filters out widgets disabled in dashboardWidgets toggles", () => {
      const toggles: DashboardWidgets = {
        subscriptions: false,
        focus: false,
        gamification: true,
        topCategories: false,
      };

      const order = [
        "focus",
        "gamification",
        "subscriptions",
        "topCategories",
        "overview",
      ];

      const widgets = getOrderedDashboardWidgets(order, toggles, true);
      expect(widgets).toEqual(["gamification", "overview"]);
    });

    it("omits the merged investments and insight cards even when they are saved", () => {
      const order = ["overview", "investments", "insight", "recentActivity"];
      const widgets = getOrderedDashboardWidgets(order, undefined, true);
      expect(widgets).toEqual(["overview", "recentActivity"]);
    });

    it("deduplicates duplicate widget keys in order list", () => {
      const order = ["overview", "overview", "quickAdd", "overview"];
      const widgets = getOrderedDashboardWidgets(order, undefined, true);
      expect(widgets).toEqual(["overview", "quickAdd"]);
    });
  });

  describe("computeTopCategories", () => {
    it("groups expenses by category and calculates percentages", () => {
      const expenses: Expense[] = [
        {
          id: "1",
          amount: 500,
          category: "Food",
          note: "Lunch",
          date: "2026-08-01",
          month: "2026-08",
          createdAt: "2026-08-01",
        },
        {
          id: "2",
          amount: 300,
          category: "Food",
          note: "Snacks",
          date: "2026-08-02",
          month: "2026-08",
          createdAt: "2026-08-02",
        },
        {
          id: "3",
          amount: 200,
          category: "Travel",
          note: "Cab",
          date: "2026-08-03",
          month: "2026-08",
          createdAt: "2026-08-03",
        },
      ];

      const { categories, totalSpent } = computeTopCategories(expenses, 5);

      expect(totalSpent).toBe(1000);
      expect(categories.length).toBe(2);
      expect(categories[0]).toEqual({
        category: "Food",
        amount: 800,
        percentage: 80,
      });
      expect(categories[1]).toEqual({
        category: "Travel",
        amount: 200,
        percentage: 20,
      });
    });

    it("handles empty expenses cleanly", () => {
      const { categories, totalSpent } = computeTopCategories([]);
      expect(totalSpent).toBe(0);
      expect(categories).toEqual([]);
    });
  });

  describe("computeDailySpendingPace", () => {
    it("calculates daily pace and projections correctly", () => {
      const expenses: Expense[] = [
        {
          id: "1",
          amount: 3000,
          category: "Shopping",
          note: "Clothes",
          date: "2026-08-01",
          month: "2026-08",
          createdAt: "2026-08-01",
        },
      ];

      const pace = computeDailySpendingPace(expenses, "2026-08", 31000);

      expect(pace.daysInMonth).toBe(31);
      expect(pace.totalSpent).toBe(3000);
      expect(pace.daysElapsed).toBeGreaterThanOrEqual(1);
      expect(pace.averageDailySpend).toBeGreaterThan(0);
      expect(pace.dailyBudgetPace).toBe(1000);
    });
  });

  describe("computeActiveCategoryBudgets", () => {
    const categoryBudgets = [
      { id: "b1", category: "Food", amount: 5000, month: "2026-10" },
      { id: "b2", category: "Food", subcategory: "Dining Out", amount: 2000, month: "2026-10" },
      { id: "b3", category: "Travel", amount: 3000, month: "2026-10" },
      { id: "b4", category: "Shopping", amount: 4000, month: "2026-09" }, // different month
    ];

    it("returns empty array when no category budgets exist for the active month", () => {
      const result = computeActiveCategoryBudgets(categoryBudgets, {}, "2026-11");
      expect(result).toEqual([]);
    });

    it("accurately rolls up category and subcategory spending and determines threshold alerts", () => {
      const expenses: Expense[] = [
        {
          id: "e1",
          amount: 1500,
          category: "Food",
          subcategory: "Dining Out",
          note: "Restaurant",
          date: "2026-10-02",
          month: "2026-10",
          createdAt: "2026-10-02",
        },
        {
          id: "e2",
          amount: 2000,
          category: "Food",
          subcategory: "Groceries",
          note: "Supermarket",
          date: "2026-10-03",
          month: "2026-10",
          createdAt: "2026-10-03",
        },
        {
          id: "e3",
          amount: 3200,
          category: "Travel",
          note: "Flight",
          date: "2026-10-04",
          month: "2026-10",
          createdAt: "2026-10-04",
        },
      ];

      const activeBudgets = computeActiveCategoryBudgets(categoryBudgets, { "Food": 3500, "Food::Dining Out": 1500, "Travel": 3200 }, "2026-10");

      expect(activeBudgets).toHaveLength(3);

      // Food total spent: 1500 + 2000 = 3500 / 5000 (70%) -> not over, not warning (<80%)
      const food = activeBudgets.find((b) => b.id === "b1");
      expect(food).toBeDefined();
      expect(food?.spent).toBe(3500);
      expect(food?.pct).toBe(70);
      expect(food?.isOver).toBe(false);
      expect(food?.isWarning).toBe(false);

      // Dining Out spent: 1500 / 2000 (75%) -> not over, not warning (<80%)
      const dining = activeBudgets.find((b) => b.id === "b2");
      expect(dining).toBeDefined();
      expect(dining?.spent).toBe(1500);
      expect(dining?.pct).toBe(75);
      expect(dining?.isOver).toBe(false);
      expect(dining?.isWarning).toBe(false);

      // Travel spent: 3200 / 3000 (100% capped display, isOver true)
      const travel = activeBudgets.find((b) => b.id === "b3");
      expect(travel).toBeDefined();
      expect(travel?.spent).toBe(3200);
      expect(travel?.pct).toBe(100);
      expect(travel?.isOver).toBe(true);
      expect(travel?.isWarning).toBe(false);
    });

    it("flags warning threshold when spending is at or above 80% without being over", () => {
      const expenses: Expense[] = [
        {
          id: "e1",
          amount: 4000,
          category: "Food",
          note: "Bulk groceries",
          date: "2026-10-05",
          month: "2026-10",
          createdAt: "2026-10-05",
        },
      ];

      const activeBudgets = computeActiveCategoryBudgets(categoryBudgets, { "Food": 4000 }, "2026-10");
      const food = activeBudgets.find((b) => b.id === "b1");
      expect(food?.spent).toBe(4000);
      expect(food?.pct).toBe(80);
      expect(food?.isOver).toBe(false);
      expect(food?.isWarning).toBe(true);
    });
  });


  describe("topCategoryShares", () => {
    it("counts parent categories only, so subcategory keys never double the total", () => {
      const { categories, totalSpent } = topCategoryShares({
        "Food & Groceries": 600,
        "Food & Groceries::Dining": 400,
        "Food & Groceries::Groceries": 200,
        Transport: 400,
        "Transport::Cab": 400,
      });
      expect(totalSpent).toBe(1000);
      expect(categories).toEqual([
        { category: "Food & Groceries", amount: 600, percentage: 60 },
        { category: "Transport", amount: 400, percentage: 40 },
      ]);
    });

    it("keeps the top N by amount and drops zero, negative and non-finite entries", () => {
      const totals = { A: 10, B: 50, C: 30, D: 0, E: -5, F: Number.NaN, G: 20 };
      const { categories, totalSpent } = topCategoryShares(totals, 3);
      expect(categories.map((c) => c.category)).toEqual(["B", "C", "G"]);
      expect(totalSpent).toBe(110);
    });

    it("returns nothing for a missing summary", () => {
      expect(topCategoryShares(null)).toEqual({ categories: [], totalSpent: 0 });
    });
  });
  describe("spendingBreakdown (SPENDLY-566)", () => {
    const totals = {
      Food: 400,
      "Food::Dining": 300,
      Shopping: 300,
      Bills: 150,
      Transport: 100,
      Health: 30,
      Gifts: 20,
    };

    it("keeps the top categories and folds the rest into Others", () => {
      const { categories, totalSpent } = spendingBreakdown(totals, 4);
      expect(totalSpent).toBe(1000);
      expect(categories.map((c) => c.category)).toEqual([
        "Food",
        "Shopping",
        "Bills",
        "Transport",
        "Others",
      ]);
      expect(categories[4]).toEqual({ category: "Others", amount: 50, percentage: 5 });
      expect(categories.reduce((sum, c) => sum + c.amount, 0)).toBe(totalSpent);
    });

    it("does not make an Others slice for a single leftover category", () => {
      const { categories } = spendingBreakdown({ A: 3, B: 2, C: 1 }, 2);
      expect(categories.map((c) => c.category)).toEqual(["A", "B", "C"]);
    });

    it("returns nothing for a missing summary", () => {
      expect(spendingBreakdown(null)).toEqual({ categories: [], totalSpent: 0 });
    });
  });

  describe("budgetProgressSummary (SPENDLY-566)", () => {
    const item = (isOver: boolean, isWarning = false): CategoryBudgetAlertItem => ({
      id: String(Math.random()),
      category: "Food",
      amount: 100,
      spent: 0,
      pct: 0,
      isOver,
      isWarning,
    });

    it("counts every budget that is not over as on track", () => {
      expect(budgetProgressSummary([item(false), item(false, true), item(true)])).toEqual({
        total: 3,
        onTrack: 2,
      });
    });

    it("is empty with no budgets", () => {
      expect(budgetProgressSummary([])).toEqual({ total: 0, onTrack: 0 });
    });
  });

  describe("getMoreDashboardWidgets (SPENDLY-566)", () => {
    it("drops the pinned widgets and keeps the user's order", () => {
      const more = getMoreDashboardWidgets(
        ["recentActivity", "gamification", "overview", "focus", "topCategories", "quickAdd"],
        undefined,
        false
      );
      expect(more).toEqual(["gamification", "focus"]);
    });

    it("honours the visibility toggles", () => {
      const more = getMoreDashboardWidgets(undefined, { ...SETTINGS_DEFAULTS.dashboardWidgets, focus: false }, false);
      expect(more).not.toContain("focus");
      expect(more).not.toContain("overview");
      expect(more).toContain("budgetAlerts");
    });
  });
});
