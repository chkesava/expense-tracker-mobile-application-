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
          category: "Food",
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
          category: "Food",
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
          category: "Food",
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
          category: "Travel",
        },
        {
          amount: 100,
          date: "2026-08-03",
          month: "2026-08",
          category: "Travel",
        },
      ],
    });
    expect(insights.some((item) => item.kind === "category_change")).toBe(
      false
    );
  });
});

describe("firstDayOfWeek", () => {
  // 2026-08-16 is a Sunday, 2026-08-17 a Monday, 2026-08-19 a Wednesday.
  const midweek = "2026-08-19";
  const expenses = [
    { amount: 100, date: "2026-08-16", month: "2026-08", category: "Food" },
    { amount: 200, date: "2026-08-17", month: "2026-08", category: "Food" },
    { amount: 300, date: "2026-08-19", month: "2026-08", category: "Food" },
  ];

  it("excludes Sunday from a Monday-first week", () => {
    const insights = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "monday",
      expenses,
    });
    // Monday 17th + Wednesday 19th only — the 16th belongs to the prior week.
    expect(insights.find((i) => i.kind === "week_total")?.text).toBe(
      "💰 You spent ₹500 this week."
    );
  });

  it("includes Sunday in a Sunday-first week", () => {
    const insights = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "sunday",
      expenses,
    });
    expect(insights.find((i) => i.kind === "week_total")?.text).toBe(
      "💰 You spent ₹600 this week."
    );
  });

  it("defaults to Monday when the preference is absent", () => {
    const withDefault = buildSmartInsights({ today: midweek, expenses });
    const withMonday = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "monday",
      expenses,
    });
    expect(withDefault.map((i) => i.text)).toEqual(withMonday.map((i) => i.text));
  });

  it("compares against the same elapsed span of the previous week", () => {
    // Wednesday => 3 days elapsed, so the baseline is Mon-Wed of last week.
    // 2026-08-12 (Wed, last week) counts; 2026-08-14 (Fri, last week) must not.
    const insights = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "monday",
      expenses: [
        { amount: 200, date: "2026-08-19", month: "2026-08", category: "Food" },
        { amount: 100, date: "2026-08-12", month: "2026-08", category: "Food" },
        { amount: 900, date: "2026-08-14", month: "2026-08", category: "Food" },
      ],
    });
    // 200 vs a 100 baseline = +100%, not 200 vs 1000.
    expect(insights.find((i) => i.kind === "category_change")?.text).toBe(
      "📈 Food spending increased 100% this week."
    );
  });

  it("applies the numberFormat preference to the week total", () => {
    const lakhs = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "monday",
      numberFormat: "lakhs",
      expenses: [
        { amount: 1_000_000, date: midweek, month: "2026-08", category: "Shopping" },
      ],
    });
    const standard = buildSmartInsights({
      today: midweek,
      firstDayOfWeek: "monday",
      numberFormat: "standard",
      expenses: [
        { amount: 1_000_000, date: midweek, month: "2026-08", category: "Shopping" },
      ],
    });
    expect(lakhs.find((i) => i.kind === "week_total")?.text).toContain("10,00,000");
    expect(standard.find((i) => i.kind === "week_total")?.text).toContain("1,000,000");
  });
});
