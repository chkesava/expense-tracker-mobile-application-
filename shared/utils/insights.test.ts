import { afterEach, describe, expect, it, vi } from "vitest";
import type { Expense } from "../types/expense";
import { getSmartInsight, getUsageColor } from "./insights";

function expense(amount: number, category = "Food"): Expense {
  return {
    amount,
    category,
    note: "",
    date: "2026-08-01",
    month: "2026-08",
    createdAt: "2026-08-01",
  };
}

describe("insights", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getUsageColor", () => {
    it("maps usage bands to semantic tokens", () => {
      expect(getUsageColor(50)).toBe("success");
      expect(getUsageColor(80)).toBe("warning");
      expect(getUsageColor(100)).toBe("destructive");
    });
  });

  describe("getSmartInsight", () => {
    it("asks user to set a budget when monthlyBudget is non-positive", () => {
      expect(getSmartInsight([], 0, "2026-08").type).toBe("neutral");
    });

    it("returns danger when spending exceeds budget", () => {
      const insight = getSmartInsight([expense(1200)], 1000, "2026-08");
      expect(insight.type).toBe("danger");
      expect(insight.message).toContain("exceeded");
    });

    it("returns warning near budget limit", () => {
      expect(getSmartInsight([expense(850)], 1000, "2026-08").type).toBe("warning");
    });

    it("returns success when spending is on track in the current month", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
      const insight = getSmartInsight([expense(200)], 1000, "2026-08");
      expect(insight.type).toBe("success");
    });
  });
});
