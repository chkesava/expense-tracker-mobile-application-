/**
 * SPENDLY-605 — a repayment written to history while the parent's stored
 * cache still said ₹0 received.
 *
 * These tests replay the provider's write the way it builds it (summary →
 * `denormalized*CacheFields` → stored parent) and then read it back through
 * the SPENDLY-434 fast path, so they cover both halves of the bug: the stamp
 * that dropped the repayment and the read path that trusted it.
 */
import { describe, expect, it } from "vitest";

import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import {
  borrowingCacheAsOfDate,
  borrowingCacheDrifted,
  borrowingRepaymentTotals,
  buildBorrowingUpdatePayload,
  denormalizedBorrowingCacheFields,
  summarizeBorrowing,
  summarizeBorrowings,
} from "./borrowingMath";
import { cacheStampDate } from "./interestMath";
import {
  buildReceivableUpdatePayload,
  denormalizedReceivableCacheFields,
  receivableCacheAsOfDate,
  receivableCacheDrifted,
  receivableRepaymentTotals,
  summarizeReceivable,
  summarizeReceivables,
} from "./receivableMath";

const TODAY = "2026-10-21";

function lend(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    userId: "u1",
    personType: "FRIEND",
    personName: "Friend",
    originalAmount: 1195,
    lentDate: "2026-10-01",
    dueDate: "2026-10-15",
    sourceAccountId: "acc-lent-from",
    status: "ACTIVE",
    // As createReceivable stamps it.
    totalReceived: 0,
    outstandingAmount: 1195,
    accruedInterest: 0,
    ...overrides,
  };
}

function collect(overrides: Partial<ReceivableRepayment> = {}): ReceivableRepayment {
  return {
    id: "p1",
    receivableId: "r1",
    amount: 1195,
    principalComponent: overrides.amount ?? 1195,
    interestComponent: 0,
    receivedAccountId: "acc-received-into",
    date: TODAY,
    ...overrides,
  };
}

/** The provider's addReceivableRepayment stamp, applied to the stored doc. */
function stampReceivable(
  receivable: Receivable,
  rows: ReceivableRepayment[],
  today: string
): Receivable {
  const next = summarizeReceivable(
    receivable,
    rows,
    receivableCacheAsOfDate(receivable.id, rows, today)
  );
  return { ...receivable, ...denormalizedReceivableCacheFields(next) };
}

describe("cacheStampDate", () => {
  it("is today when every movement is on or before it", () => {
    expect(cacheStampDate(TODAY, [{ date: "2026-10-01" }, { date: TODAY }])).toBe(TODAY);
  });

  it("moves to the latest movement dated after today", () => {
    expect(
      cacheStampDate(TODAY, [{ date: "2026-10-22" }, { date: "2026-10-23" }])
    ).toBe("2026-10-23");
  });
});

describe("SPENDLY-605 — receivable cache stamp", () => {
  it("reproduces the bug: stamping as of today drops a repayment dated after it", () => {
    const rows = [collect({ date: "2026-10-22" })];
    const old = summarizeReceivable(lend(), rows, TODAY);
    expect(old.totalReceived).toBe(0);
    expect(old.outstandingAmount).toBe(1195);
  });

  it("settles on a full repayment dated after the provider's today", () => {
    const stored = stampReceivable(lend(), [collect({ date: "2026-10-22" })], TODAY);
    expect(stored.totalReceived).toBe(1195);
    expect(stored.outstandingAmount).toBe(0);
    expect(stored.status).toBe("FULLY_SETTLED");
    expect(stored.settledDate).toBe("2026-10-22");
  });

  it("settles on a full repayment dated today", () => {
    const stored = stampReceivable(lend(), [collect()], TODAY);
    expect(stored.totalReceived).toBe(1195);
    expect(stored.outstandingAmount).toBe(0);
    expect(stored.status).toBe("FULLY_SETTLED");
  });

  it("leaves a partial repayment open with the exact remainder", () => {
    const stored = stampReceivable(
      lend({ dueDate: "2026-12-31" }),
      [collect({ amount: 400, principalComponent: 400 })],
      TODAY
    );
    expect(stored.totalReceived).toBe(400);
    expect(stored.outstandingAmount).toBe(795);
    expect(stored.status).toBe("PARTIALLY_SETTLED");
  });

  it("adds up several repayments", () => {
    const rows = [
      collect({ id: "p1", amount: 195, principalComponent: 195, date: "2026-10-05" }),
      collect({ id: "p2", amount: 500, principalComponent: 500, date: "2026-10-10" }),
      collect({ id: "p3", amount: 500, principalComponent: 500, date: "2026-10-22" }),
    ];
    const stored = stampReceivable(lend(), rows, TODAY);
    expect(stored.totalReceived).toBe(1195);
    expect(stored.outstandingAmount).toBe(0);
    expect(stored.status).toBe("FULLY_SETTLED");
  });

  it("ignores another receivable's future repayment when choosing the date", () => {
    const rows = [collect({ id: "x", receivableId: "r2", date: "2026-12-01" })];
    expect(receivableCacheAsOfDate("r1", rows, TODAY)).toBe(TODAY);
  });

  it("an edit restamps with every recorded repayment", () => {
    const rows = [collect({ amount: 400, principalComponent: 400, date: "2026-10-22" })];
    const built = buildReceivableUpdatePayload(
      lend(),
      { dueDate: "2026-12-31" },
      rows,
      TODAY
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.fields.totalReceived).toBe(400);
    expect(built.fields.outstandingAmount).toBe(795);
  });
});

describe("SPENDLY-605 — receivable drift guard on the fast path", () => {
  // The stored doc exactly as the bug left it in production.
  const stale = lend({ status: "OVERDUE" });
  const rows = [collect({ date: "2026-10-22" })];

  it("flags a cache that disagrees with its repayment rows", () => {
    expect(receivableCacheDrifted(stale, receivableRepaymentTotals(rows))).toBe(true);
  });

  it("portfolio totals come from the rows when the cache drifted", () => {
    const portfolio = summarizeReceivables([stale], rows, "2026-10-24");
    expect(portfolio.totalReceived).toBe(1195);
    expect(portfolio.totalOutstanding).toBe(0);
    expect(portfolio.settledCount).toBe(1);
    expect(portfolio.overdueCount).toBe(0);
  });

  it("does not judge a receivable whose rows have not loaded yet", () => {
    const settled = stampReceivable(lend(), rows, TODAY);
    expect(receivableCacheDrifted(settled, receivableRepaymentTotals([]))).toBe(false);
    // Before the repayment listener delivers, the stored cache still answers.
    const portfolio = summarizeReceivables([settled], [], TODAY);
    expect(portfolio.totalReceived).toBe(1195);
    expect(portfolio.totalOutstanding).toBe(0);
  });

  it("keeps the fast path when the cache agrees with the rows", () => {
    const settled = stampReceivable(lend(), rows, TODAY);
    expect(receivableCacheDrifted(settled, receivableRepaymentTotals(rows))).toBe(false);
  });

  it("heals a last-writer-wins stamp from a second device", () => {
    // Device A records 500; device B, on a snapshot without A's row, records
    // 300 and stamps only its own. Both rows exist; the cache says 300.
    const a = collect({ id: "pa", amount: 500, principalComponent: 500, date: "2026-10-10" });
    const b = collect({ id: "pb", amount: 300, principalComponent: 300, date: "2026-10-11" });
    const fromB = stampReceivable(lend({ dueDate: "2026-12-31" }), [b], TODAY);
    const both = [a, b];
    expect(fromB.totalReceived).toBe(300);
    expect(receivableCacheDrifted(fromB, receivableRepaymentTotals(both))).toBe(true);
    const portfolio = summarizeReceivables([fromB], both, TODAY);
    expect(portfolio.totalReceived).toBe(800);
    expect(portfolio.totalOutstanding).toBe(395);
  });

  it("counts a retried write once: rows are keyed by their client id", () => {
    const store = new Map<string, ReceivableRepayment>();
    const row = collect();
    store.set(row.id!, row);
    store.set(row.id!, row); // outbox retry of the same `set`
    const stored = stampReceivable(lend(), [...store.values()], TODAY);
    expect(stored.totalReceived).toBe(1195);
    const portfolio = summarizeReceivables([stored], [...store.values()], TODAY);
    expect(portfolio.totalReceived).toBe(1195);
  });
});

function borrow(overrides: Partial<Borrowing> = {}): Borrowing {
  return {
    id: "b1",
    userId: "u1",
    lenderType: "FRIEND",
    lenderName: "Friend",
    principalAmount: 1000,
    interestRate: 0,
    interestType: "NONE",
    interestFrequency: "NONE",
    interestBasis: "ORIGINAL_PRINCIPAL",
    borrowedDate: "2026-10-01",
    creditedAccountId: "acc-in",
    status: "ACTIVE",
    totalPaid: 0,
    totalOutstanding: 1000,
    ...overrides,
  };
}

function repay(overrides: Partial<BorrowingRepayment> = {}): BorrowingRepayment {
  return {
    id: "q1",
    borrowingId: "b1",
    amount: 1000,
    principalComponent: overrides.amount ?? 1000,
    interestComponent: 0,
    paymentAccountId: "acc-out",
    date: TODAY,
    ...overrides,
  };
}

function stampBorrowing(
  borrowing: Borrowing,
  rows: BorrowingRepayment[],
  today: string
): Borrowing {
  const next = summarizeBorrowing(
    borrowing,
    rows,
    borrowingCacheAsOfDate(borrowing.id, rows, today)
  );
  return { ...borrowing, ...denormalizedBorrowingCacheFields(next) };
}

describe("SPENDLY-605 — borrowing mirror", () => {
  it("settles on a full repayment dated after today", () => {
    const stored = stampBorrowing(borrow(), [repay({ date: "2026-10-22" })], TODAY);
    expect(stored.totalPaid).toBe(1000);
    expect(stored.totalOutstanding).toBe(0);
    expect(stored.status).toBe("FULLY_SETTLED");
  });

  it("leaves a partial repayment open with the exact remainder", () => {
    const stored = stampBorrowing(
      borrow(),
      [repay({ amount: 250, principalComponent: 250 })],
      TODAY
    );
    expect(stored.totalPaid).toBe(250);
    expect(stored.totalOutstanding).toBe(750);
    expect(stored.status).toBe("PARTIALLY_SETTLED");
  });

  it("an edit restamps with every recorded repayment", () => {
    const rows = [repay({ amount: 250, principalComponent: 250, date: "2026-10-22" })];
    const built = buildBorrowingUpdatePayload(borrow(), { dueDate: "2026-12-31" }, rows, TODAY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.fields.totalPaid).toBe(250);
    expect(built.fields.totalOutstanding).toBe(750);
  });

  it("portfolio totals come from the rows when the cache drifted", () => {
    const rows = [repay({ date: "2026-10-22" })];
    const stale = borrow();
    expect(borrowingCacheDrifted(stale, borrowingRepaymentTotals(rows))).toBe(true);
    const portfolio = summarizeBorrowings([stale], rows, "2026-10-24");
    expect(portfolio.totalRepaid).toBe(1000);
    expect(portfolio.totalOutstanding).toBe(0);
    expect(portfolio.settledCount).toBe(1);
  });

  it("does not judge a borrowing whose rows have not loaded yet", () => {
    const settled = stampBorrowing(borrow(), [repay()], TODAY);
    expect(borrowingCacheDrifted(settled, borrowingRepaymentTotals([]))).toBe(false);
    expect(summarizeBorrowings([settled], [], TODAY).totalOutstanding).toBe(0);
  });

  it("keeps the fast path when the cache agrees with the rows", () => {
    const rows = [repay()];
    const settled = stampBorrowing(borrow(), rows, TODAY);
    expect(borrowingCacheDrifted(settled, borrowingRepaymentTotals(rows))).toBe(false);
  });
});
