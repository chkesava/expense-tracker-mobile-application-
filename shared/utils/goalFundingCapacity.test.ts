import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import type { Expense, Income } from "../types/expense";
import type { Subscription } from "../types/subscription";
import { queryCalendar } from "./calendarQuery";
import { buildFundingCapacity } from "./goalFundingCapacity";
import { buildRunwayBaseline } from "./runwayBaseline";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: `${over.source ?? "subscription"}:${over.refId ?? "r"}:${over.date ?? "2026-11-05"}`,
  source: "subscription",
  refId: "r",
  date: "2026-11-05",
  title: "x",
  amount: 1000,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/x",
  ...over,
});
const window = { from: "2026-10-15", to: "2027-01-13" }; // ~3 months
const baseline = { monthlyEarnedIncome: 100000, monthlyOutflowByClass: { essential: 40000, discretionary: 15000, savings_contribution: 10000, debt_service: 5000, fee: 500 } };

describe("capacity", () => {
  it("is income minus everyday spending minus scheduled commitments per month, line by line", () => {
    const events = [ev({ refId: "rent", amount: 15000 }), ev({ refId: "rent2", amount: 15000, date: "2026-12-05" }), ev({ refId: "rent3", amount: 15000, date: "2027-01-05" })];
    const c = buildFundingCapacity({ baseline, events, window });
    expect(c.windowMonths).toBe(3);
    expect(c.parts.map((p) => [p.key, p.monthly])).toEqual([
      ["income", 100000],
      ["everyday_outflow", -60500],
      ["commitments", -15000],
    ]);
    expect(c.monthly).toBe(24500);
    expect(c.status).toBe("positive");
    expect(c.parts[2].events).toHaveLength(3);
  });

  it("does not double count money already going to savings", () => {
    const c = buildFundingCapacity({ baseline, events: [], window });
    expect(c.alreadyToSavingsMonthly).toBe(10000);
    expect(c.monthly).toBe(100000 - 60500);
  });

  it("only counts open recurring items, EMIs and loan due dates", () => {
    const events = [
      ev({ refId: "a", source: "emi", amount: 3000 }),
      ev({ refId: "b", source: "borrowing", amount: 6000 }),
      ev({ refId: "paid", state: "completed", amount: 99999 }),
      ev({ refId: "card", source: "card_bill", amount: 99999 }),
      ev({ refId: "sip", source: "sip", amount: 99999 }),
      ev({ refId: "rem", source: "reminder", direction: "neutral", amount: 99999 }),
    ];
    expect(buildFundingCapacity({ baseline, events, window }).parts[2].monthly).toBe(-3000);
  });

  it("lists unknown amounts instead of treating them as zero, and keeps uncertain inflows out", () => {
    const c = buildFundingCapacity({
      baseline,
      events: [ev({ refId: "loan", source: "borrowing", amount: null }), ev({ refId: "owed", source: "receivable", direction: "in", state: "expected", amount: 5000 })],
      window,
    });
    expect(c.commitmentsWithoutAmount.map((e) => e.refId)).toEqual(["loan"]);
    expect(c.notCountedInflows.map((e) => e.refId)).toEqual(["owed"]);
    expect(c.monthly).toBe(39500);
  });

  it("reports zero, negative and unknown explicitly", () => {
    expect(buildFundingCapacity({ baseline: { monthlyEarnedIncome: 60500, monthlyOutflowByClass: baseline.monthlyOutflowByClass }, events: [], window }).status).toBe("zero");
    expect(buildFundingCapacity({ baseline: { monthlyEarnedIncome: 30000, monthlyOutflowByClass: baseline.monthlyOutflowByClass }, events: [], window })).toMatchObject({ status: "negative", monthly: -30500 });
    expect(buildFundingCapacity({ baseline: null, events: [], window })).toMatchObject({ status: "unknown", monthly: null, parts: [] });
  });

  it("uses a planned amount the user typed instead of the calculation", () => {
    const c = buildFundingCapacity({ baseline: null, events: [], window, plannedMonthly: 12000 });
    expect(c).toMatchObject({ monthly: 12000, status: "positive", usesPlannedOverride: true });
    expect(c.parts).toEqual([{ key: "planned_override", label: "Amount you plan to save each month", monthly: 12000, source: "you" }]);
  });
});

describe("reconciles with canonical data", () => {
  it("matches the runway baseline and calendar built from real records, without mutating them", () => {
    const exp = (date: string, amount: number, category: string, subcategory: string, over: Partial<Expense> = {}): Expense =>
      ({ id: `${date}${amount}`, amount, category, subcategory, note: "", date, month: date.slice(0, 7), createdAt: 1, ...over }) as Expense;
    const expenses = [
      ...["2026-07", "2026-08", "2026-09"].flatMap((m) => [
        exp(`${m}-03`, 20000, "Food & Groceries", "Groceries / Kirana"),
        exp(`${m}-05`, 15000, "Home & Household", "Rent", { subscriptionId: "rent" }),
        exp(`${m}-10`, 5000, "Investments & Savings", "SIP"),
      ]),
    ];
    const incomes = ["2026-07", "2026-08", "2026-09"].map((m) => ({ id: m, amount: 70000, source: "Salary", note: "", date: `${m}-01`, month: m, createdAt: 1 }) as Income);
    const subscriptions: Subscription[] = [{ id: "rent", name: "Rent", amount: 15000, category: "Home & Household", dayOfMonth: 5, isActive: true, lastProcessed: "2026-10", type: "subscription" }];
    const before = JSON.stringify({ expenses, incomes, subscriptions });
    const b = buildRunwayBaseline({ expenses, incomes, subscriptions, today: "2026-10-15", windowMonths: 3, method: "average" });
    const empty = { bills: [], cardNames: new Map(), borrowings: [], receivables: [], incomes: [], goals: [], investments: [], sipPlans: [], epfContributions: [], epfEmployerNames: new Map() };
    const q = queryCalendar({ range: window, today: "2026-10-15", currency: "INR", data: { ...empty, subscriptions } });
    const c = buildFundingCapacity({ baseline: b.projectionBaseline, events: q.events, window });
    // 70,000 income − 20,000 groceries (rent removed from the baseline, added back once via the calendar) − 15,000 rent.
    expect(c.monthly).toBe(35000);
    expect(c.alreadyToSavingsMonthly).toBe(5000);
    expect(JSON.stringify({ expenses, incomes, subscriptions })).toBe(before);
  });
});
