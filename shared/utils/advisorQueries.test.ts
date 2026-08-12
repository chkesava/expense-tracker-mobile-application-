import { describe, expect, it } from "vitest";

import {
  answerAdvisorQuery,
  matchAdvisorQueryIntent,
  parseSpendAmount,
} from "./advisorQueries";

const ctx = {
  currency: "₹",
  currentMonth: "2026-08",
  foodSpend: 4200,
  topCategory: {
    category: "Food & Dining",
    amount: 4200,
    percentage: 50,
  },
  monthlyBudget: 20_000,
  monthSpent: 12_000,
  netSavings: 8_000,
};

describe("advisorQueries", () => {
  it("answers food spend this month", () => {
    expect(matchAdvisorQueryIntent("How much did I spend on food this month?")).toBe(
      "food_month"
    );
    expect(
      answerAdvisorQuery("How much did I spend on food this month?", ctx)
    ).toContain("4,200");
  });

  it("answers where spending is highest", () => {
    expect(matchAdvisorQueryIntent("Where am I spending the most?")).toBe(
      "top_spend"
    );
    expect(answerAdvisorQuery("Where am I spending the most?", ctx)).toContain(
      "Food & Dining"
    );
  });

  it("answers a weekend spend check", () => {
    expect(parseSpendAmount("Can I spend ₹3,000 this weekend?")).toBe(3000);
    const yes = answerAdvisorQuery("Can I spend ₹3,000 this weekend?", ctx);
    expect(yes).toMatch(/Yes/);
    expect(yes).toContain("8,000");

    const no = answerAdvisorQuery("Can I spend ₹9,000 this weekend?", ctx);
    expect(no).toMatch(/stretch/);
  });
});
