import { describe, expect, it } from "vitest";

import { composeNetWorth, type NetWorthInputs } from "@/shared/utils/netWorth";

/**
 * Regression cover for the dashboard's headline number — KAN-73.
 *
 * This lived in `hooks/useUnifiedNetWorth.ts`, which vitest never ran, and
 * KAN-71 modified it by adding EPF to `totalAssets`. The assertion that matters
 * most is the one proving EPF *added* a line rather than moving an existing
 * one: with `epfValue: 0` the totals must be exactly what they were before EPF
 * existed.
 */

const SAVINGS = "type-savings";
const CREDIT = "type-credit";

const typeMap = new Map([
  [SAVINGS, "Savings"],
  [CREDIT, "Credit Card"],
]);

function account(id: string, typeId: string, openingBalance: number) {
  return {
    id,
    name: id,
    typeId,
    openingBalance,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as NetWorthInputs["accounts"][number];
}

function holding(yahooSymbol: string, quantity: number, averageBuyPrice: number) {
  return {
    id: yahooSymbol,
    symbol: yahooSymbol,
    yahooSymbol,
    name: yahooSymbol,
    quantity,
    averageBuyPrice,
  } as unknown as NetWorthInputs["holdings"][number];
}

function inputs(overrides: Partial<NetWorthInputs> = {}): NetWorthInputs {
  return {
    accounts: [],
    typeMap,
    expenses: [],
    incomes: [],
    payments: [],
    bills: [],
    entries: [],
    transfers: [],
    borrowings: [],
    borrowingRepayments: [],
    receivables: [],
    receivableRepayments: [],
    borrowingOutstanding: 0,
    receivableOutstanding: 0,
    investments: [],
    holdings: [],
    quotes: new Map(),
    investmentCashBalance: 0,
    epfValue: 0,
    epfUnreconciledCount: 0,
    today: "2026-09-12",
    ...overrides,
  };
}

describe("composeNetWorth — the identity that must hold", () => {
  it("always reports net worth as assets minus liabilities", () => {
    const result = composeNetWorth(
      inputs({
        accounts: [account("a", SAVINGS, 50_000)],
        receivableOutstanding: 10_000,
        borrowingOutstanding: 30_000,
        epfValue: 100_000,
      })
    );

    expect(result.totalNetWorth).toBe(result.totalAssets - result.totalLiabilities);
  });

  it("sums the asset lines into totalAssets and nothing else", () => {
    const result = composeNetWorth(
      inputs({
        accounts: [account("a", SAVINGS, 50_000)],
        investmentCashBalance: 5_000,
        receivableOutstanding: 10_000,
        epfValue: 100_000,
      })
    );

    expect(result.totalAssets).toBe(
      result.liquidBankAssets +
        result.investmentsValue +
        result.totalStocksValue +
        result.receivableAssets +
        result.epfValue
    );
  });

  it("sums the liability lines into totalLiabilities and nothing else", () => {
    const result = composeNetWorth(
      inputs({
        accounts: [account("a", SAVINGS, -2_000)],
        borrowingOutstanding: 30_000,
      })
    );

    expect(result.totalLiabilities).toBe(
      result.creditCardLiabilities +
        result.bankOverdraftLiabilities +
        result.borrowingLiabilities
    );
  });

  it("is all zeroes for a user with no data at all", () => {
    const result = composeNetWorth(inputs());
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
    expect(result.totalNetWorth).toBe(0);
  });
});

describe("EPF regression — KAN-71 added a line, it did not move one", () => {
  const base = inputs({
    accounts: [account("a", SAVINGS, 50_000), account("b", SAVINGS, -2_000)],
    investmentCashBalance: 5_000,
    holdings: [holding("INFY.NS", 10, 1_400)],
    receivableOutstanding: 10_000,
    borrowingOutstanding: 30_000,
  });

  it("produces the pre-EPF totals when epfValue is zero", () => {
    // The whole point: an Expense user who has never opened EPF must see
    // exactly the number they saw before the epic landed.
    const withoutEpf = composeNetWorth({ ...base, epfValue: 0 });

    expect(withoutEpf.epfValue).toBe(0);
    expect(withoutEpf.totalAssets).toBe(
      withoutEpf.liquidBankAssets +
        withoutEpf.investmentsValue +
        withoutEpf.totalStocksValue +
        withoutEpf.receivableAssets
    );
  });

  it("moves only the EPF line and the two totals when EPF is present", () => {
    const without = composeNetWorth({ ...base, epfValue: 0 });
    const with_ = composeNetWorth({ ...base, epfValue: 250_000 });

    // Every non-EPF line is untouched.
    expect(with_.liquidBankAssets).toBe(without.liquidBankAssets);
    expect(with_.investmentsValue).toBe(without.investmentsValue);
    expect(with_.stocksHoldingsValue).toBe(without.stocksHoldingsValue);
    expect(with_.stocksCashBalance).toBe(without.stocksCashBalance);
    expect(with_.totalStocksValue).toBe(without.totalStocksValue);
    expect(with_.receivableAssets).toBe(without.receivableAssets);
    expect(with_.creditCardLiabilities).toBe(without.creditCardLiabilities);
    expect(with_.bankOverdraftLiabilities).toBe(without.bankOverdraftLiabilities);
    expect(with_.borrowingLiabilities).toBe(without.borrowingLiabilities);

    // EPF is an asset, so it never touches liabilities.
    expect(with_.totalLiabilities).toBe(without.totalLiabilities);

    // And it moves assets and net worth by exactly its own value.
    expect(with_.totalAssets).toBe(without.totalAssets + 250_000);
    expect(with_.totalNetWorth).toBe(without.totalNetWorth + 250_000);
  });

  it("passes the unreconciled count through untouched", () => {
    // The dashboard labels the figure "simulated" from this; it is not money
    // and must never reach a total.
    const result = composeNetWorth({ ...base, epfValue: 100, epfUnreconciledCount: 7 });
    expect(result.epfUnreconciledCount).toBe(7);
    expect(result.totalAssets).toBe(
      composeNetWorth({ ...base, epfValue: 100, epfUnreconciledCount: 0 }).totalAssets
    );
  });
});

describe("account classification", () => {
  it("counts a positive non-credit balance as a liquid asset", () => {
    const result = composeNetWorth(inputs({ accounts: [account("a", SAVINGS, 50_000)] }));
    expect(result.liquidBankAssets).toBe(50_000);
    expect(result.bankOverdraftLiabilities).toBe(0);
  });

  it("counts a negative non-credit balance as an overdraft liability, unsigned", () => {
    const result = composeNetWorth(inputs({ accounts: [account("a", SAVINGS, -2_000)] }));
    expect(result.bankOverdraftLiabilities).toBe(2_000);
    expect(result.liquidBankAssets).toBe(0);
  });

  it("keeps a zero balance out of both sides", () => {
    const result = composeNetWorth(inputs({ accounts: [account("a", SAVINGS, 0)] }));
    expect(result.liquidBankAssets).toBe(0);
    expect(result.bankOverdraftLiabilities).toBe(0);
  });

  it("never counts a credit card as a liquid asset", () => {
    const result = composeNetWorth(inputs({ accounts: [account("c", CREDIT, 0)] }));
    expect(result.liquidBankAssets).toBe(0);
  });

  it("treats an account whose type is missing as non-credit", () => {
    // getAccountKind("") is not "credit", so it goes down the bank path rather
    // than silently vanishing from the roll-up.
    const result = composeNetWorth(
      inputs({ accounts: [account("a", "type-that-does-not-exist", 1_000)] })
    );
    expect(result.liquidBankAssets).toBe(1_000);
  });

  it("aggregates across many accounts on both sides", () => {
    const result = composeNetWorth(
      inputs({
        accounts: [
          account("a", SAVINGS, 10_000),
          account("b", SAVINGS, 5_000),
          account("c", SAVINGS, -1_500),
        ],
      })
    );
    expect(result.liquidBankAssets).toBe(15_000);
    expect(result.bankOverdraftLiabilities).toBe(1_500);
  });
});

describe("stocks", () => {
  it("values a holding at its live quote when one exists", () => {
    const result = composeNetWorth(
      inputs({
        holdings: [holding("INFY.NS", 10, 1_400)],
        quotes: new Map([["INFY.NS", { currentPrice: 1_500 }]]),
      })
    );
    expect(result.stocksHoldingsValue).toBe(15_000);
  });

  it("falls back to the average buy price when no quote has arrived", () => {
    // Cost basis, not zero — a missing quote must not erase the holding.
    const result = composeNetWorth(inputs({ holdings: [holding("INFY.NS", 10, 1_400)] }));
    expect(result.stocksHoldingsValue).toBe(14_000);
  });

  it("adds uninvested demat cash to the stocks total", () => {
    const result = composeNetWorth(
      inputs({ holdings: [holding("INFY.NS", 10, 1_400)], investmentCashBalance: 6_000 })
    );
    expect(result.totalStocksValue).toBe(20_000);
    expect(result.stocksCashBalance).toBe(6_000);
  });

  it("counts demat cash even with no holdings at all", () => {
    const result = composeNetWorth(inputs({ investmentCashBalance: 6_000 }));
    expect(result.totalStocksValue).toBe(6_000);
    expect(result.totalAssets).toBe(6_000);
  });
});

describe("borrowings and receivables sit on opposite sides", () => {
  it("counts borrowings as a liability", () => {
    const result = composeNetWorth(inputs({ borrowingOutstanding: 30_000 }));
    expect(result.borrowingLiabilities).toBe(30_000);
    expect(result.totalNetWorth).toBe(-30_000);
  });

  it("counts receivables as a non-cash asset", () => {
    const result = composeNetWorth(inputs({ receivableOutstanding: 10_000 }));
    expect(result.receivableAssets).toBe(10_000);
    expect(result.totalNetWorth).toBe(10_000);
  });

  it("nets out when someone owes exactly what is owed", () => {
    const result = composeNetWorth(
      inputs({ borrowingOutstanding: 10_000, receivableOutstanding: 10_000 })
    );
    expect(result.totalNetWorth).toBe(0);
  });
});
