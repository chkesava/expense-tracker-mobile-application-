import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense, Income } from "../types/expense";
import {
  getAnomalyMetrics,
  getCashFlowMetrics,
  getFixedVsVariableMetrics,
  getMonthDayProgress,
  getPacingMetrics,
} from "./insightMetrics";

function expense(
  partial: Partial<Expense> & Pick<Expense, "amount" | "category" | "date" | "month">
): Expense {
  return {
    note: "",
    createdAt: partial.date,
    ...partial,
  };
}

function income(
  partial: Partial<Income> & Pick<Income, "amount" | "date" | "month">
): Income {
  return {
    source: "Salary",
    note: "",
    createdAt: partial.date,
    ...partial,
  };
}

describe("insightMetrics", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getMonthDayProgress", () => {
    it("uses today within the current local month and full length for past months", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));

      expect(getMonthDayProgress("2026-08")).toMatchObject({
        dayOfMonth: 11,
        totalDays: 31,
        isCurrentMonth: true,
      });
      expect(getMonthDayProgress("2026-07")).toMatchObject({
        dayOfMonth: 31,
        totalDays: 31,
        isCurrentMonth: false,
      });
    });
  });

  describe("getPacingMetrics", () => {
    it("projects end-of-month spend from MTD run rate", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));

      const metrics = getPacingMetrics(
        [
          expense({ amount: 1000, category: "Food", date: "2026-08-05", month: "2026-08" }),
          expense({ amount: 500, category: "Food", date: "2026-07-05", month: "2026-07" }),
        ],
        "2026-08"
      );

      expect(metrics.currentMonthMtdTotal).toBe(1000);
      expect(metrics.dayOfMonth).toBe(10);
      expect(metrics.projectedEndMonthTotal).toBe(3100); // 1000/10*31
      expect(metrics.historicAverageMonthlyTotal).toBe(500);
    });
  });

  describe("getCashFlowMetrics", () => {
    it("computes net cash flow and savings rate", () => {
      const result = getCashFlowMetrics(
        [income({ amount: 10000, date: "2026-08-01", month: "2026-08" })],
        [expense({ amount: 2500, category: "Food", date: "2026-08-02", month: "2026-08" })],
        "2026-08"
      );
      expect(result).toMatchObject({
        totalIncome: 10000,
        totalExpense: 2500,
        netCashFlow: 7500,
        savingsRate: 75,
      });
    });

    it("returns zero savings rate when income is zero", () => {
      expect(
        getCashFlowMetrics(
          [],
          [expense({ amount: 100, category: "Food", date: "2026-08-01", month: "2026-08" })],
          "2026-08"
        ).savingsRate
      ).toBe(0);
    });
  });

  describe("getFixedVsVariableMetrics", () => {
    it("treats known fixed categories and isRecurring as fixed", () => {
      const result = getFixedVsVariableMetrics(
        [
          expense({ amount: 1000, category: "Rent", date: "2026-08-01", month: "2026-08" }),
          expense({
            amount: 200,
            category: "Food",
            date: "2026-08-02",
            month: "2026-08",
            isRecurring: true,
          }),
          expense({ amount: 300, category: "Food", date: "2026-08-03", month: "2026-08" }),
        ],
        "2026-08"
      );
      expect(result.fixedTotal).toBe(1200);
      expect(result.variableTotal).toBe(300);
      expect(result.fixedPercentage).toBe(80);
    });
  });

  describe("getAnomalyMetrics", () => {
    it("flags categories spending >=30% above historic average (above noise floor)", () => {
      const expenses = [
        expense({ amount: 1000, category: "Food", date: "2026-07-01", month: "2026-07" }),
        expense({ amount: 1500, category: "Food", date: "2026-08-01", month: "2026-08" }),
        expense({ amount: 50, category: "Snacks", date: "2026-07-01", month: "2026-07" }),
        expense({ amount: 200, category: "Snacks", date: "2026-08-01", month: "2026-08" }),
      ];
      const { anomalies, largestTransaction } = getAnomalyMetrics(expenses, "2026-08");
      expect(anomalies.some((a) => a.category === "Food")).toBe(true);
      // historic avg 50 < 200 noise floor → no anomaly
      expect(anomalies.some((a) => a.category === "Snacks")).toBe(false);
      expect(largestTransaction?.amount).toBe(1500);
    });
  });
});
