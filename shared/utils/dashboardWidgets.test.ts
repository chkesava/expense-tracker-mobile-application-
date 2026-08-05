import { describe, expect, it } from "vitest";
import type { Expense } from "@/shared/types/expense";
import type { DashboardWidgets } from "@/shared/types/settings";
import {
  computeDailySpendingPace,
  computeExpenseStreak,
  computeTopCategories,
  getOrderedDashboardWidgets,
  KNOWN_DASHBOARD_WIDGETS,
} from "./dashboardWidgets";

describe("dashboardWidgets utilities", () => {
  describe("getOrderedDashboardWidgets", () => {
    it("returns default widget list when order is undefined", () => {
      const widgets = getOrderedDashboardWidgets(undefined, undefined, true);
      expect(widgets).toEqual(KNOWN_DASHBOARD_WIDGETS);
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

    it("omits investments widget when enableInvestments is false", () => {
      const order = ["overview", "investments", "recentActivity"];
      const widgets = getOrderedDashboardWidgets(order, undefined, false);
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

  describe("computeExpenseStreak", () => {
    it("computes consecutive days logged up to target date", () => {
      const expenses: Expense[] = [
        {
          id: "1",
          amount: 50,
          category: "Food",
          note: "Coffee",
          date: "2026-08-05",
          month: "2026-08",
          createdAt: "2026-08-05",
        },
        {
          id: "2",
          amount: 100,
          category: "Food",
          note: "Dinner",
          date: "2026-08-04",
          month: "2026-08",
          createdAt: "2026-08-04",
        },
        {
          id: "3",
          amount: 75,
          category: "Food",
          note: "Groceries",
          date: "2026-08-03",
          month: "2026-08",
          createdAt: "2026-08-03",
        },
      ];

      const streak = computeExpenseStreak(expenses, "2026-08-05");
      expect(streak).toBe(3);
    });

    it("returns 0 if today has no expense", () => {
      const expenses: Expense[] = [
        {
          id: "1",
          amount: 50,
          category: "Food",
          note: "Coffee",
          date: "2026-08-04",
          month: "2026-08",
          createdAt: "2026-08-04",
        },
      ];

      const streak = computeExpenseStreak(expenses, "2026-08-05");
      expect(streak).toBe(0);
    });
  });
});
