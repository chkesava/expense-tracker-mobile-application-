import { describe, expect, it } from "vitest";

import { FIXTURE_TODAY, fullLedgerFixture } from "../__fixtures__/readModel/fullLedger";
import { buildUserBaseline, renderBaselineMarkdown } from "./financialBaseline";
import { recomputeFinancialState } from "./reconciliation";
import { roundMoney } from "./money";

describe("financial baseline (SPENDLY-503)", () => {
  const baseline = buildUserBaseline(fullLedgerFixture(), FIXTURE_TODAY);

  it("matches the checked-in reference snapshot for the golden fixture", () => {
    expect(baseline).toMatchSnapshot();
  });

  it("finds no stored-vs-recomputed variance on a clean ledger", () => {
    expect(baseline.accounts.map((a) => [a.name, a.status, a.variance])).toEqual([
      ["Fixture Bank", "match", 0],
      ["Fixture Wallet", "match", 0],
      ["Fixture Card", "match", 0],
    ]);
  });

  it("counts soft-deleted and voided rows separately and keeps them out of totals", () => {
    expect(baseline.counts.expenses).toEqual({ total: 8, active: 7, inactive: 1 });
    expect(baseline.counts.accountPayments).toEqual({ total: 3, active: 2, inactive: 1 });
    // e3 (999, deleted) is not in September's expense total; e4 (restored) is in October's.
    expect(baseline.sumsByMonth.expenses["2026-09"]).toBe(1200 + 450 + 4000 + 1500);
    expect(baseline.sumsByMonth.expenses["2026-10"]).toBe(300 + 250 + 800);
    // The voided 999 payment is not summed.
    expect(baseline.sumsByAccount.accountPayments.bank).toBe(3000);
  });

  it("books a cross-month edit to its month, not its date", () => {
    expect(baseline.sumsByAccount.expenses.wallet).toBe(250);
    expect(baseline.sumsByMonth.expenses["2026-09"]).not.toBe(1200 + 450 + 4000 + 1500 + 250);
  });

  it("conserves money across transfers", () => {
    const fixture = fullLedgerFixture();
    const onlyTransfers = {
      ...fixture,
      expenses: [],
      incomes: [],
      accountEntries: [],
      accountPayments: [],
      creditCardBills: [],
      borrowings: [],
      borrowingRepayments: [],
      receivables: [],
      receivableRepayments: [],
    };
    const state = recomputeFinancialState(
      {
        ...onlyTransfers,
        payments: [],
        entries: [],
        transfers: onlyTransfers.accountTransfers,
        bills: [],
      } as never,
      FIXTURE_TODAY
    );
    const openings = fixture.accounts
      .filter((a: any) => a.openingBalance !== undefined && a.id !== "card")
      .reduce((s: number, a: any) => s + a.openingBalance, 0);
    const banks = state.accounts.filter((p) => p.kind === "bank");
    const total = roundMoney(banks.reduce((s, p) => s + (p.set.currentBalance as number), 0));
    expect(total).toBe(openings);
  });

  it("reports the card's open statement and the EPF closing balance", () => {
    expect(baseline.cards).toEqual([
      { accountId: "card", name: "Fixture Card", openBills: 1, openAmount: 1000, amountPaid: 3000 },
    ]);
    // Two credited months (4750 each) + FY interest.
    expect(baseline.epfClosingBalance).toBe(4750 * 2 + 412.5);
  });

  it("values net worth on stored and on recomputed balances, equal when there is no variance", () => {
    expect(baseline.netWorthRecomputed).toEqual(baseline.netWorth);
    const fixture = fullLedgerFixture();
    fixture.accounts = fixture.accounts.map((a: any) => (a.id === "bank" ? { ...a, currentBalance: 60650 } : a));
    const drifted = buildUserBaseline(fixture, FIXTURE_TODAY);
    expect(drifted.netWorth.totalNetWorth).toBe(roundMoney(baseline.netWorth.totalNetWorth - 5000));
    expect(drifted.netWorthRecomputed).toEqual(baseline.netWorthRecomputed);
  });

  it("renders markdown with no uid in it", () => {
    const md = renderBaselineMarkdown("u#ab12cd34ef", baseline);
    expect(md).toContain("### User u#ab12cd34ef");
    expect(md).toContain("| Fixture Bank | bank | 65650 | 65650 | 0 | match |");
    expect(md).not.toContain("fixture-user");
  });
});
