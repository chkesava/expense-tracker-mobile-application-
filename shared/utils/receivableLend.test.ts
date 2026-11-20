import { describe, expect, it } from "vitest";

import type {
  Receivable,
  ReceivableLend,
  ReceivableRepayment,
} from "../types/receivable";
import { planDebtCacheRepair } from "./debtCacheRepair";
import { ledgerRowAccountDeltas } from "./ledgerAccountDeltas";
import {
  buildReceivableUpdatePayload,
  computeAccruedInterest,
  denormalizedReceivableCacheFields,
  receivableCacheDrifted,
  receivableLendTotals,
  receivablePrincipalLent,
  receivableRepaymentTotals,
  summarizeReceivable,
  summarizeReceivables,
  validateReceivableLend,
  validateReceivableLendDelete,
  validateReceivableRepayment,
} from "./receivableMath";

/** SPENDLY-792 — "Lend more": the same person borrows again later. */

function makeReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    userId: "u1",
    personType: "FRIEND",
    personName: "Ravi",
    originalAmount: 10000,
    lentDate: "2026-01-01",
    sourceAccountId: "bank",
    sourceMode: "account",
    status: "ACTIVE",
    ...overrides,
  };
}

function makeLend(overrides: Partial<ReceivableLend> = {}): ReceivableLend {
  return {
    id: "l1",
    receivableId: "r1",
    amount: 5000,
    date: "2026-02-01",
    month: "2026-02",
    sourceMode: "account",
    sourceAccountId: "bank",
    ...overrides,
  };
}

function makeRepayment(
  overrides: Partial<ReceivableRepayment> = {}
): ReceivableRepayment {
  return {
    id: "p1",
    receivableId: "r1",
    amount: 4000,
    principalComponent: 4000,
    interestComponent: 0,
    receivedAccountId: "bank",
    date: "2026-01-20",
    ...overrides,
  };
}

const withInterest = (
  overrides: Partial<Receivable> = {}
): Receivable =>
  makeReceivable({
    interestRate: 1,
    interestType: "SIMPLE",
    interestFrequency: "MONTHLY",
    interestBasis: "OUTSTANDING_PRINCIPAL",
    ...overrides,
  });

describe("summarizeReceivable with later lends", () => {
  it("is unchanged for a receivable with no later lends", () => {
    const repayments = [makeRepayment()];
    const without = summarizeReceivable(makeReceivable(), repayments, "2026-03-01");
    const withEmpty = summarizeReceivable(makeReceivable(), repayments, "2026-03-01", []);
    expect(withEmpty).toEqual(without);
    expect(without.additionalLent).toBe(0);
    expect(without.principalLent).toBe(10000);
    expect(without.outstandingAmount).toBe(6000);
  });

  it("raises what is owed after a partial repayment", () => {
    // Lent 10000, got 4000 back, then lent 5000 more: 11000 owed.
    const summary = summarizeReceivable(
      makeReceivable(),
      [makeRepayment()],
      "2026-03-01",
      [makeLend()]
    );
    expect(summary.additionalLent).toBe(5000);
    expect(summary.principalLent).toBe(15000);
    expect(summary.totalReceived).toBe(4000);
    expect(summary.outstandingAmount).toBe(11000);
    expect(summary.status).toBe("PARTIALLY_SETTLED");
  });

  it("ignores lends of other receivables and lends after the as-of date", () => {
    const summary = summarizeReceivable(makeReceivable(), [], "2026-01-31", [
      makeLend(), // 2026-02-01, after the as-of date
      makeLend({ id: "l2", receivableId: "other", date: "2026-01-15" }),
    ]);
    expect(summary.additionalLent).toBe(0);
    expect(summary.outstandingAmount).toBe(10000);
  });

  it("reopens a fully settled receivable when they borrow again", () => {
    const repaid = [makeRepayment({ amount: 10000, principalComponent: 10000 })];
    const before = summarizeReceivable(makeReceivable(), repaid, "2026-03-01");
    expect(before.status).toBe("FULLY_SETTLED");

    const after = summarizeReceivable(makeReceivable(), repaid, "2026-03-01", [
      makeLend({ date: "2026-02-15" }),
    ]);
    expect(after.status).toBe("PARTIALLY_SETTLED");
    expect(after.outstandingAmount).toBe(5000);
    expect(after.settledDate).toBeNull();
  });

  it("lets a repayment cover the larger amount", () => {
    const summary = summarizeReceivable(makeReceivable(), [], "2026-03-01", [makeLend()]);
    expect(validateReceivableRepayment(15000, summary).ok).toBe(true);
    expect(validateReceivableRepayment(15001, summary).ok).toBe(false);
  });

  it("keeps a cancelled receivable cancelled", () => {
    const summary = summarizeReceivable(
      makeReceivable({ status: "CANCELLED" }),
      [],
      "2026-03-01",
      [makeLend()]
    );
    expect(summary.status).toBe("CANCELLED");
  });
});

describe("interest on a later lend starts from its own date", () => {
  // 10000 lent 2026-01-01 at 1% monthly; 5000 more on 2026-02-01.
  it("outstanding-principal basis: the lend raises the principal from its date", () => {
    // Jan 10000×1% = 100, Feb 15000×1% = 150.
    expect(
      computeAccruedInterest(withInterest(), [], "2026-03-01", [makeLend()])
    ).toBe(250);
  });

  it("outstanding-principal basis: repayments and lends both move the principal", () => {
    // Jan 100, Feb 150, then 5000 principal back on 03-01: Mar 10000×1% = 100.
    const repayments = [makeRepayment({ amount: 5000, principalComponent: 5000, date: "2026-03-01" })];
    expect(
      computeAccruedInterest(withInterest(), repayments, "2026-04-01", [makeLend()])
    ).toBe(350);
  });

  it("original-principal basis: each lend is charged from its own date", () => {
    // 10000×1%×3 + 5000×1%×2, repayments ignored on this basis.
    const repayments = [makeRepayment({ amount: 5000, principalComponent: 5000, date: "2026-03-01" })];
    expect(
      computeAccruedInterest(
        withInterest({ interestBasis: "ORIGINAL_PRINCIPAL" }),
        repayments,
        "2026-04-01",
        [makeLend()]
      )
    ).toBe(400);
  });

  it("one-time interest: charged on each lend once it has been made", () => {
    const oneTime = withInterest({ interestRate: 10, interestFrequency: "ONE_TIME" });
    expect(computeAccruedInterest(oneTime, [], "2026-01-15", [makeLend()])).toBe(1000);
    expect(computeAccruedInterest(oneTime, [], "2026-03-01", [makeLend()])).toBe(1500);
  });

  it("stops at interestStoppedDate like the first lend", () => {
    const stopped = withInterest({ interestStoppedDate: "2026-02-01" });
    // Only January accrues; the lend starts the day interest stopped.
    expect(computeAccruedInterest(stopped, [], "2026-06-01", [makeLend()])).toBe(100);
  });

  it("does not change interest for a receivable without later lends", () => {
    for (const basis of ["OUTSTANDING_PRINCIPAL", "ORIGINAL_PRINCIPAL"] as const) {
      const r = withInterest({ interestBasis: basis });
      expect(computeAccruedInterest(r, [makeRepayment()], "2026-05-01", [])).toBe(
        computeAccruedInterest(r, [makeRepayment()], "2026-05-01")
      );
    }
  });
});

describe("validateReceivableLend", () => {
  const today = "2026-03-01";
  it("accepts a lend dated between the first lend and today", () => {
    expect(validateReceivableLend({ amount: 500, date: "2026-02-01" }, makeReceivable(), today).ok).toBe(true);
    expect(validateReceivableLend({ amount: 500, date: today }, makeReceivable(), today).ok).toBe(true);
  });

  it.each([
    ["a zero amount", { amount: 0, date: "2026-02-01" }],
    ["a negative amount", { amount: -1, date: "2026-02-01" }],
    ["a non-number", { amount: Number.NaN, date: "2026-02-01" }],
    ["a future date", { amount: 500, date: "2026-03-02" }],
    ["a date before the first lend", { amount: 500, date: "2025-12-31" }],
    ["a malformed date", { amount: 500, date: "01-02-2026" }],
  ])("refuses %s", (_label, input) => {
    expect(validateReceivableLend(input, makeReceivable(), today).ok).toBe(false);
  });

  it("refuses a cancelled receivable", () => {
    expect(
      validateReceivableLend({ amount: 500, date: "2026-02-01" }, makeReceivable({ status: "CANCELLED" }), today).ok
    ).toBe(false);
  });
});

describe("validateReceivableLendDelete", () => {
  it("allows removing a lend that repayments don't depend on", () => {
    expect(
      validateReceivableLendDelete(makeReceivable(), "l1", [makeRepayment()], [makeLend()], "2026-03-01").ok
    ).toBe(true);
  });

  it("refuses when more principal was received than would be left lent", () => {
    // 12000 back against 10000 + 5000 lent; without the lend only 10000 was lent.
    const repayments = [makeRepayment({ amount: 12000, principalComponent: 12000, date: "2026-02-20" })];
    expect(
      validateReceivableLendDelete(makeReceivable(), "l1", repayments, [makeLend()], "2026-03-01").ok
    ).toBe(false);
  });
});

describe("editing the first lend with later lends", () => {
  it("only has to cover what the later lends don't", () => {
    // 12000 back; 5000 of it is covered by the later lend, so the floor is 7000.
    const repayments = [makeRepayment({ amount: 12000, principalComponent: 12000, date: "2026-02-20" })];
    const lends = [makeLend()];
    expect(
      buildReceivableUpdatePayload(makeReceivable(), { originalAmount: 7000 }, repayments, "2026-03-01", lends).ok
    ).toBe(true);
    expect(
      buildReceivableUpdatePayload(makeReceivable(), { originalAmount: 6999 }, repayments, "2026-03-01", lends).ok
    ).toBe(false);
  });

  it("stamps additionalLent into the cache on an edit", () => {
    const built = buildReceivableUpdatePayload(
      makeReceivable(),
      { originalAmount: 12000 },
      [],
      "2026-03-01",
      [makeLend()]
    );
    expect(built.ok && built.fields.additionalLent).toBe(5000);
    expect(built.ok && built.fields.outstandingAmount).toBe(17000);
  });

  it("refuses moving the first lend after a later one", () => {
    const built = buildReceivableUpdatePayload(
      makeReceivable(),
      { lentDate: "2026-02-15" },
      [],
      "2026-03-01",
      [makeLend()]
    );
    expect(built.ok).toBe(false);
  });
});

describe("cache and portfolio", () => {
  it("stamps additionalLent and trusts it on the fast path", () => {
    const fields = denormalizedReceivableCacheFields(
      summarizeReceivable(makeReceivable(), [], "2026-03-01", [makeLend()])
    );
    expect(fields.additionalLent).toBe(5000);
    expect(fields.outstandingAmount).toBe(15000);

    const cached = makeReceivable({ ...fields, totalReceived: 0 });
    const portfolio = summarizeReceivables([cached], [], "2026-03-01");
    expect(portfolio.totalLent).toBe(15000);
    expect(portfolio.totalOutstanding).toBe(15000);
  });

  it("flags a cache that disagrees with the lend rows", () => {
    const cached = makeReceivable({ totalReceived: 0, outstandingAmount: 10000, additionalLent: 0 });
    const lends = [makeLend()];
    expect(
      receivableCacheDrifted(cached, receivableRepaymentTotals([]), receivableLendTotals(lends))
    ).toBe(true);
    // The portfolio then falls back to the rows.
    expect(summarizeReceivables([cached], [], "2026-03-01", lends).totalOutstanding).toBe(15000);
  });

  it("uses the cached additionalLent while the lend rows are not loaded", () => {
    const cached = makeReceivable({ totalReceived: 4000, outstandingAmount: 11000, additionalLent: 5000 });
    expect(
      receivableCacheDrifted(cached, receivableRepaymentTotals([makeRepayment()]))
    ).toBe(false);
  });

  it("counts later lends in the principal lent", () => {
    expect(receivablePrincipalLent(makeReceivable(), [makeLend()], "2026-03-01")).toBe(15000);
    expect(receivablePrincipalLent(makeReceivable(), [makeLend()], "2026-01-31")).toBe(10000);
  });

  it("the cache repair restamps a parent whose lends are missing from its cache", () => {
    const cached = makeReceivable({ totalReceived: 0, outstandingAmount: 10000, additionalLent: 0 });
    const plans = planDebtCacheRepair(
      { borrowings: [], borrowingRepayments: [], receivables: [cached], receivableRepayments: [], receivableLends: [makeLend()] },
      "2026-03-01"
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].next).toMatchObject({ additionalLent: 5000, outstandingAmount: 15000 });
  });

  it("the cache repair leaves a parent alone that has no lends and no cached sum", () => {
    const cached = makeReceivable({ totalReceived: 0, outstandingAmount: 10000 });
    const plans = planDebtCacheRepair(
      { borrowings: [], borrowingRepayments: [], receivables: [cached], receivableRepayments: [], receivableLends: [] },
      "2026-03-01"
    );
    expect(plans).toEqual([]);
  });
});

describe("ledger leg of a later lend", () => {
  it("debits its source account on its own date", () => {
    expect(ledgerRowAccountDeltas({ kind: "receivableLend", row: makeLend() })).toEqual([
      { accountId: "bank", amountDelta: -5000, date: "2026-02-01" },
    ]);
  });

  it("moves no balance when already deducted", () => {
    expect(
      ledgerRowAccountDeltas({
        kind: "receivableLend",
        row: makeLend({ sourceMode: "already_deducted", sourceAccountId: null }),
      })
    ).toEqual([]);
  });
});
