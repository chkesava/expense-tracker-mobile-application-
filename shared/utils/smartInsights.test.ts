import { describe, expect, it } from "vitest";

import { buildSmartInsights } from "./smartInsights";

const today = "2026-08-12";

describe("buildSmartInsights", () => {
  it("reports week total, food week-over-week, and budget approach", () => {
    const insights = buildSmartInsights({
      today,
      monthlyBudget: 10_000,
      currency: "INR",
      expenses: [
        {
          amount: 1240,
          date: "2026-08-10",
          month: "2026-08",
          category: "Food & Dining",
        },
        {
          amount: 7180,
          date: "2026-08-11",
          month: "2026-08",
          category: "Shopping",
        },
        {
          amount: 1000,
          date: "2026-08-03",
          month: "2026-08",
          category: "Food & Dining",
        },
      ],
    });

    expect(insights.map((item) => item.text)).toEqual([
      "📈 Food spending increased 24% this week.",
      "💰 You spent ₹8,420 this week.",
      "⚠️ You're approaching your monthly budget.",
    ]);
  });

  it("skips category percent without a last-week baseline", () => {
    const insights = buildSmartInsights({
      today,
      expenses: [
        {
          amount: 500,
          date: "2026-08-12",
          month: "2026-08",
          category: "Food & Dining",
        },
      ],
    });
    expect(insights.some((item) => item.kind === "category_change")).toBe(
      false
    );
    expect(insights[0]?.text).toBe("💰 You spent ₹500 this week.");
  });

  it("warns when the monthly budget is exceeded", () => {
    const insights = buildSmartInsights({
      today,
      monthlyBudget: 1000,
      expenses: [
        {
          amount: 1200,
          date: "2026-08-02",
          month: "2026-08",
          category: "Shopping",
        },
      ],
    });
    expect(insights.some((item) => item.text.includes("exceeded"))).toBe(true);
  });

  it("returns nothing when there is no spend and no budget pressure", () => {
    expect(
      buildSmartInsights({
        today,
        monthlyBudget: 10_000,
        expenses: [],
      })
    ).toEqual([]);
  });

  it("ignores category moves under 10%", () => {
    const insights = buildSmartInsights({
      today,
      expenses: [
        {
          amount: 105,
          date: "2026-08-10",
          month: "2026-08",
          category: "Transportation",
        },
        {
          amount: 100,
          date: "2026-08-03",
          month: "2026-08",
          category: "Transportation",
        },
      ],
    });
    expect(insights.some((item) => item.kind === "category_change")).toBe(
      false
    );
  });
});
