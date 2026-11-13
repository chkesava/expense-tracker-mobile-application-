import { describe, expect, it } from "vitest";
import { buildCashFlowSummary } from "./cashFlowCard";

describe("buildCashFlowSummary", () => {
  it("derives opening from the known closing balance and the month's income/expenses", () => {
    const summary = buildCashFlowSummary({ income: 50000, expenses: 15000, transfersTotal: 0, closing: 40000 });
    expect(summary).toEqual({ opening: 5000, income: 50000, expenses: 15000, transfersTotal: 0, closing: 40000 });
    expect(summary.opening + summary.income - summary.expenses).toBe(summary.closing);
  });

  it("never lets transfers change opening, closing, income or expenses (no double-counting)", () => {
    const withoutTransfers = buildCashFlowSummary({ income: 50000, expenses: 15000, transfersTotal: 0, closing: 40000 });
    const withTransfers = buildCashFlowSummary({ income: 50000, expenses: 15000, transfersTotal: 7500, closing: 40000 });
    expect(withTransfers.opening).toBe(withoutTransfers.opening);
    expect(withTransfers.closing).toBe(withoutTransfers.closing);
    expect(withTransfers.income).toBe(withoutTransfers.income);
    expect(withTransfers.expenses).toBe(withoutTransfers.expenses);
    expect(withTransfers.transfersTotal).toBe(7500);
  });

  it("accounts for a bill payment the same way it is already excluded from expenses upstream", () => {
    // A credit-card bill payment never reaches `expenses` (it is an
    // AccountPayment row, not a Journal row) — this file trusts that and
    // never re-derives it, so passing a smaller `expenses` figure (as the
    // canonical hook already produces) simply flows straight through.
    const summary = buildCashFlowSummary({ income: 0, expenses: 0, transfersTotal: 12000, closing: 20000 });
    expect(summary.opening).toBe(20000);
    expect(summary.closing).toBe(20000);
  });

  it("rounds to paise", () => {
    const summary = buildCashFlowSummary({ income: 100.126, expenses: 0, transfersTotal: 0, closing: 100.126 });
    expect(summary.income).toBe(100.13);
    expect(summary.closing).toBe(100.13);
  });
});
