import { describe, expect, it } from "vitest";

import type { Expense, Income } from "../types/expense";
import type { Subscription } from "../types/subscription";
import { buildRunwayBaseline, type RunwayBaselineInput } from "./runwayBaseline";
import { runRunwayEngine } from "./runwayEngine";

let n = 0;
const exp = (date: string, amount: number, category = "Food & Groceries", subcategory = "Groceries / Kirana", over: Partial<Expense> = {}): Expense => ({
  id: `e${++n}`,
  amount,
  category,
  subcategory,
  note: "",
  date,
  month: date.slice(0, 7),
  createdAt: 1,
  ...over,
});
const inc = (date: string, amount: number, source = "Salary"): Income => ({ id: `i${++n}`, amount, source, note: "", date, month: date.slice(0, 7), createdAt: 1 });

const input = (over: Partial<RunwayBaselineInput> = {}): RunwayBaselineInput => ({
  expenses: [],
  incomes: [],
  subscriptions: [],
  today: "2026-10-15",
  windowMonths: 3,
  method: "average",
  ...over,
});

const threeMonths = [
  exp("2026-07-05", 10000),
  exp("2026-08-05", 20000),
  exp("2026-09-05", 30000),
  inc("2026-07-01", 50000),
  inc("2026-08-01", 50000),
  inc("2026-09-01", 50000),
];

describe("window", () => {
  it("uses the last N complete months and reports the partial current month separately", () => {
    const r = buildRunwayBaseline(
      input({ expenses: [...threeMonths.filter((x): x is Expense => "category" in x), exp("2026-10-02", 99999), exp("2026-06-30", 77777)], incomes: threeMonths.filter((x): x is Income => "source" in x) })
    );
    expect(r.window).toEqual({ months: 3, from: "2026-07", to: "2026-09", method: "average" });
    expect(r.months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(r.currentMonth).toMatchObject({ month: "2026-10", outflow: 99999, transactionCount: 1 });
    expect(r.burnBaseline).toEqual({ monthlyEarnedIncome: 50000, monthlyOutflowByClass: expect.objectContaining({ essential: 20000 }) });
  });

  it("supports average and median", () => {
    // 20,000 is under 2 × the 11,000 median month, so nothing is unusual.
    const expenses = [exp("2026-07-05", 10000), exp("2026-08-05", 11000), exp("2026-09-05", 20000)];
    expect(buildRunwayBaseline(input({ expenses, method: "average" })).burnBaseline!.monthlyOutflowByClass.essential).toBe(13666.67);
    expect(buildRunwayBaseline(input({ expenses, method: "median" })).burnBaseline!.monthlyOutflowByClass.essential).toBe(11000);
  });
});

describe("missing and partial months", () => {
  it("excludes months before the first record and flags empty months", () => {
    const r = buildRunwayBaseline(input({ windowMonths: 6, expenses: [exp("2026-06-10", 12000), exp("2026-09-10", 12000)] }));
    expect(r.months.map((m) => [m.month, m.status])).toEqual([
      ["2026-04", "before_history"],
      ["2026-05", "before_history"],
      ["2026-06", "included"],
      ["2026-07", "empty"],
      ["2026-08", "empty"],
      ["2026-09", "included"],
    ]);
    expect(r.monthsOfHistory).toBe(2);
    expect(r.burnBaseline!.monthlyOutflowByClass.essential).toBe(12000);
    expect(r.assumptions).toContain("short_history");
  });

  it("returns no baseline without a complete month", () => {
    const r = buildRunwayBaseline(input({ expenses: [exp("2026-10-01", 500)] }));
    expect(r.monthsOfHistory).toBe(0);
    expect(r.burnBaseline).toBeNull();
    expect(r.projectionBaseline).toBeNull();
    expect(r.assumptions).toContain("no_history");
  });
});

describe("classification", () => {
  it("splits classes, offsets refunds against discretionary and never counts money movement", () => {
    const r = buildRunwayBaseline(
      input({
        windowMonths: 1,
        expenses: [
          exp("2026-09-02", 8000),
          exp("2026-09-03", 3000, "Shopping & Clothing", "Clothes"),
          exp("2026-09-04", 5000, "Investments & Savings", "SIP"),
          exp("2026-09-05", 20000, "Finance, Loans & Insurance", "Credit Card Payment"),
        ],
        incomes: [inc("2026-09-01", 60000), inc("2026-09-10", 1000, "Refund"), inc("2026-09-11", 90000, "Investment Proceeds")],
      })
    );
    expect(r.burnBaseline).toEqual({
      monthlyEarnedIncome: 60000,
      monthlyOutflowByClass: { essential: 8000, discretionary: 2000, savings_contribution: 5000, debt_service: 0, fee: 0 },
    });
    expect(r.reconciliation).toMatchObject({ moneyMovement: 20000, refunds: 1000, ignoredIncome: 90000 });
  });

  it("ignores deleted rows and bad amounts", () => {
    const r = buildRunwayBaseline(input({ windowMonths: 1, expenses: [exp("2026-09-02", 100), exp("2026-09-02", 999, undefined, undefined, { deletedAt: "2026-09-03" }), exp("2026-09-02", -5)] }));
    expect(r.reconciliation.expenseTotal).toBe(100);
  });
});

describe("unusual one-time expenses", () => {
  const expenses = [exp("2026-07-05", 20000), exp("2026-08-05", 20000), exp("2026-09-05", 20000), exp("2026-09-20", 150000, "Shopping & Clothing", "Laptop / Computer")];

  it("lists and excludes a single expense larger than two median months", () => {
    const r = buildRunwayBaseline(input({ expenses }));
    expect(r.unusual).toEqual([expect.objectContaining({ amount: 150000, category: "Shopping & Clothing" })]);
    expect(r.burnBaseline!.monthlyOutflowByClass.discretionary).toBe(0);
    expect(r.months[2].unusualExcluded).toBe(150000);
  });

  it("keeps it when asked", () => {
    const r = buildRunwayBaseline(input({ expenses, includeUnusual: true }));
    expect(r.unusual).toHaveLength(1);
    expect(r.burnBaseline!.monthlyOutflowByClass.discretionary).toBe(50000);
  });
});

describe("recurring items are not counted twice", () => {
  const subs: Subscription[] = [
    { id: "rent", name: "Rent", amount: 15000, category: "Home & Household", dayOfMonth: 5, isActive: true, lastProcessed: "2026-09", type: "subscription" },
    { id: "old", name: "Old gym", amount: 2000, category: "Health & Medical", dayOfMonth: 1, isActive: false, lastProcessed: "2026-07", type: "subscription" },
  ];
  const expenses = [
    exp("2026-09-05", 15000, "Home & Household", "Rent", { subscriptionId: "rent" }),
    exp("2026-09-01", 2000, "Home & Household", "Rent", { subscriptionId: "old" }),
    exp("2026-09-10", 10000),
  ];

  it("keeps posted recurring expenses in the burn baseline but removes active ones from the projection baseline", () => {
    const r = buildRunwayBaseline(input({ windowMonths: 1, expenses, subscriptions: subs }));
    expect(r.burnBaseline!.monthlyOutflowByClass.essential).toBe(27000);
    expect(r.projectionBaseline!.monthlyOutflowByClass.essential).toBe(12000);
  });

  it("flags SMS-detected recurring items as possible overlap", () => {
    const r = buildRunwayBaseline(input({ windowMonths: 1, expenses, subscriptions: [{ ...subs[0], source: "sms" }] }));
    expect(r.assumptions).toContain("uncertain_commitments");
  });
});

describe("reconciliation", () => {
  it("accounts for every source rupee in the window", () => {
    const expenses = [
      exp("2026-07-05", 20000),
      exp("2026-08-05", 20000),
      exp("2026-09-05", 20000),
      exp("2026-09-06", 5000, "Miscellaneous", "Transfer"),
      exp("2026-09-20", 150000, "Shopping & Clothing", "Laptop / Computer"),
    ];
    const r = buildRunwayBaseline(input({ expenses }));
    const { expenseTotal, countedOutflow, moneyMovement, unusualExcluded } = r.reconciliation;
    expect(expenseTotal).toBe(215000);
    expect(countedOutflow + moneyMovement + unusualExcluded).toBe(expenseTotal);
  });

  it("feeds the engine", () => {
    const r = buildRunwayBaseline(input({ expenses: threeMonths.filter((x): x is Expense => "category" in x), incomes: [] }));
    const out = runRunwayEngine({ today: "2026-10-15", mode: "gross_burn", projectionMonths: 12, threshold: { kind: "none" }, liquid: 100000, baseline: r.burnBaseline, events: [] });
    expect(out.result).toMatchObject({ state: "finite", months: 5 });
  });
});

describe("performance", () => {
  it("handles 50,000 transactions over 12 months quickly", () => {
    const expenses: Expense[] = [];
    for (let i = 0; i < 50000; i++) expenses.push(exp(`2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, 100 + (i % 50)));
    const t0 = performance.now();
    const r = buildRunwayBaseline(input({ today: "2027-01-10", windowMonths: 12, expenses }));
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r.monthsOfHistory).toBe(12);
  });
});
