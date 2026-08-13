import { describe, expect, it } from "vitest";

import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import {
  allocateRepayment,
  computeAccruedInterest,
  describeInterest,
  elapsedMonths,
  monthlyInterestRate,
  summarizeBorrowing,
  summarizeBorrowings,
  validateRepayment,
} from "./borrowingMath";

function makeBorrowing(overrides: Partial<Borrowing> = {}): Borrowing {
  return {
    id: "b1",
    userId: "u1",
    lenderType: "FINANCE_INSTITUTION",
    lenderName: "Super Finance",
    principalAmount: 20000,
    interestRate: 12,
    interestType: "SIMPLE",
    interestFrequency: "ANNUAL",
    interestBasis: "ORIGINAL_PRINCIPAL",
    borrowedDate: "2026-01-01",
    creditedAccountId: "acc-hdfc",
    status: "ACTIVE",
    ...overrides,
  };
}

function makeRepayment(
  overrides: Partial<BorrowingRepayment> = {}
): BorrowingRepayment {
  return {
    id: "r1",
    borrowingId: "b1",
    amount: 5000,
    principalComponent: 5000,
    interestComponent: 0,
    paymentAccountId: "acc-hdfc",
    date: "2026-02-01",
    ...overrides,
  };
}

describe("elapsedMonths", () => {
  it("is exactly 1 at a calendar month boundary", () => {
    expect(elapsedMonths("2026-01-01", "2026-02-01")).toBe(1);
    expect(elapsedMonths("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("returns 0 when the end date is on or before the start", () => {
    expect(elapsedMonths("2026-01-01", "2026-01-01")).toBe(0);
    expect(elapsedMonths("2026-03-01", "2026-01-01")).toBe(0);
  });

  it("expresses a partial month as a fraction of that month", () => {
    // 15 days into a 31-day January.
    const months = elapsedMonths("2026-01-01", "2026-01-16");
    expect(months).toBeCloseTo(15 / 31, 5);
  });

  it("clamps month-end anchors across shorter months", () => {
    expect(elapsedMonths("2026-01-31", "2026-02-28")).toBe(1);
  });

  it("counts whole years as twelve months", () => {
    expect(elapsedMonths("2026-01-01", "2027-01-01")).toBe(12);
  });
});

describe("monthlyInterestRate", () => {
  it("converts an annual rate to a monthly decimal", () => {
    expect(monthlyInterestRate(makeBorrowing({ interestRate: 12 }))).toBeCloseTo(
      0.01,
      10
    );
  });

  it("uses a monthly rate as-is", () => {
    const borrowing = makeBorrowing({
      interestFrequency: "MONTHLY",
      interestRate: 2,
    });
    expect(monthlyInterestRate(borrowing)).toBeCloseTo(0.02, 10);
  });

  it("is zero for one-time and interest-free borrowings", () => {
    expect(
      monthlyInterestRate(makeBorrowing({ interestFrequency: "ONE_TIME" }))
    ).toBe(0);
    expect(
      monthlyInterestRate(
        makeBorrowing({ interestType: "NONE", interestFrequency: "NONE" })
      )
    ).toBe(0);
  });
});

describe("computeAccruedInterest", () => {
  it("charges 200 a month on 20000 at 12% annual", () => {
    const borrowing = makeBorrowing();
    expect(computeAccruedInterest(borrowing, [], "2026-02-01")).toBe(200);
    expect(computeAccruedInterest(borrowing, [], "2026-04-01")).toBe(600);
  });

  it("charges nothing for an interest-free borrowing", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    expect(computeAccruedInterest(borrowing, [], "2027-01-01")).toBe(0);
  });

  it("charges a monthly rate directly", () => {
    const borrowing = makeBorrowing({
      interestFrequency: "MONTHLY",
      interestRate: 1,
    });
    expect(computeAccruedInterest(borrowing, [], "2026-03-01")).toBe(400);
  });

  it("charges a one-time rate once regardless of elapsed time", () => {
    const borrowing = makeBorrowing({
      interestFrequency: "ONE_TIME",
      interestRate: 5,
    });
    expect(computeAccruedInterest(borrowing, [], "2026-02-01")).toBe(1000);
    expect(computeAccruedInterest(borrowing, [], "2029-02-01")).toBe(1000);
  });

  it("charges nothing before the borrowed date", () => {
    expect(computeAccruedInterest(makeBorrowing(), [], "2025-12-01")).toBe(0);
  });

  it("ignores repayments when the basis is the original principal", () => {
    const borrowing = makeBorrowing({ interestBasis: "ORIGINAL_PRINCIPAL" });
    const repayments = [makeRepayment({ amount: 10000, principalComponent: 10000 })];
    // Still 1% of the full 20000 for all three months.
    expect(computeAccruedInterest(borrowing, repayments, "2026-04-01")).toBe(600);
  });

  it("charges only what was still owed when the basis is outstanding principal", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ amount: 10000, principalComponent: 10000, date: "2026-02-01" }),
    ];
    // Month 1 on 20000 = 200, months 2 and 3 on 10000 = 200.
    expect(computeAccruedInterest(borrowing, repayments, "2026-04-01")).toBe(400);
  });

  it("segments the timeline across multiple repayments", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ id: "r1", amount: 5000, principalComponent: 5000, date: "2026-02-01" }),
      makeRepayment({ id: "r2", amount: 5000, principalComponent: 5000, date: "2026-03-01" }),
    ];
    // 20000 for month 1, 15000 for month 2, 10000 for month 3.
    expect(computeAccruedInterest(borrowing, repayments, "2026-04-01")).toBe(450);
  });

  it("ignores repayments dated after the as-of date", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ amount: 20000, principalComponent: 20000, date: "2026-06-01" }),
    ];
    expect(computeAccruedInterest(borrowing, repayments, "2026-02-01")).toBe(200);
  });

  it("ignores repayments belonging to a different borrowing", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ borrowingId: "other", amount: 20000, principalComponent: 20000 }),
    ];
    expect(computeAccruedInterest(borrowing, repayments, "2026-02-01")).toBe(200);
  });

  it("accrues across a long historical borrowing", () => {
    const borrowing = makeBorrowing({ borrowedDate: "2020-01-01" });
    expect(computeAccruedInterest(borrowing, [], "2021-01-01")).toBe(2400);
  });
});

describe("summarizeBorrowing", () => {
  it("derives the spec example: 20000 borrowed, 10000 repaid", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments = [
      makeRepayment({ amount: 10000, principalComponent: 10000 }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-03-01");

    expect(summary.principalAmount).toBe(20000);
    expect(summary.principalPaid).toBe(10000);
    expect(summary.outstandingPrincipal).toBe(10000);
    expect(summary.totalOutstanding).toBe(10000);
    expect(summary.status).toBe("PARTIALLY_SETTLED");
    expect(summary.repaymentCount).toBe(1);
  });

  it("adds accrued interest to the total outstanding", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ amount: 10000, principalComponent: 10000, date: "2026-02-01" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-03-01");

    expect(summary.outstandingPrincipal).toBe(10000);
    expect(summary.interestAccrued).toBe(300);
    expect(summary.outstandingInterest).toBe(300);
    expect(summary.totalOutstanding).toBe(10300);
  });

  it("is ACTIVE before any repayment", () => {
    const summary = summarizeBorrowing(makeBorrowing(), [], "2026-01-15");
    expect(summary.status).toBe("ACTIVE");
    expect(summary.totalPaid).toBe(0);
    expect(summary.settledDate).toBeNull();
  });

  it("sums unlimited partial repayments", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments = [
      makeRepayment({ id: "r1", amount: 5000, principalComponent: 5000, date: "2026-08-10" }),
      makeRepayment({ id: "r2", amount: 3000, principalComponent: 3000, date: "2026-08-20" }),
      makeRepayment({ id: "r3", amount: 2000, principalComponent: 2000, date: "2026-08-30" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-09-01");

    expect(summary.principalPaid).toBe(10000);
    expect(summary.outstandingPrincipal).toBe(10000);
    expect(summary.repaymentCount).toBe(3);
    expect(summary.status).toBe("PARTIALLY_SETTLED");
  });

  it("marks FULLY_SETTLED with a settlement date once nothing is owed", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments = [
      makeRepayment({ id: "r1", amount: 12000, principalComponent: 12000, date: "2026-02-01" }),
      makeRepayment({ id: "r2", amount: 8000, principalComponent: 8000, date: "2026-03-05" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-04-01");

    expect(summary.outstandingPrincipal).toBe(0);
    expect(summary.outstandingInterest).toBe(0);
    expect(summary.status).toBe("FULLY_SETTLED");
    expect(summary.settledDate).toBe("2026-03-05");
  });

  it("stays unsettled while interest is still owed", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({ amount: 20000, principalComponent: 20000, date: "2026-02-01" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-02-01");

    expect(summary.outstandingPrincipal).toBe(0);
    expect(summary.interestAccrued).toBe(200);
    expect(summary.outstandingInterest).toBe(200);
    expect(summary.status).toBe("PARTIALLY_SETTLED");
  });

  it("reports OVERDUE past the due date while money is owed", () => {
    const borrowing = makeBorrowing({
      dueDate: "2026-03-01",
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });

    const summary = summarizeBorrowing(borrowing, [], "2026-04-01");

    expect(summary.isOverdue).toBe(true);
    expect(summary.status).toBe("OVERDUE");
  });

  it("is not overdue once the borrowing is settled", () => {
    const borrowing = makeBorrowing({
      dueDate: "2026-03-01",
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments = [
      makeRepayment({ amount: 20000, principalComponent: 20000, date: "2026-02-01" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-04-01");

    expect(summary.isOverdue).toBe(false);
    expect(summary.status).toBe("FULLY_SETTLED");
  });

  it("keeps a manually closed borrowing closed", () => {
    const borrowing = makeBorrowing({ status: "CLOSED" });
    expect(summarizeBorrowing(borrowing, [], "2026-06-01").status).toBe("CLOSED");
  });

  it("never reports a negative outstanding principal after overpayment", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments = [
      makeRepayment({ amount: 25000, principalComponent: 25000, date: "2026-02-01" }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-03-01");

    expect(summary.outstandingPrincipal).toBe(0);
    expect(summary.status).toBe("FULLY_SETTLED");
  });

  it("treats a repayment with no explicit split as pure principal", () => {
    const borrowing = makeBorrowing({
      interestType: "NONE",
      interestFrequency: "NONE",
      interestRate: 0,
    });
    const repayments: BorrowingRepayment[] = [
      { id: "r1", borrowingId: "b1", amount: 4000, date: "2026-02-01" },
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-03-01");

    expect(summary.principalPaid).toBe(4000);
    expect(summary.outstandingPrincipal).toBe(16000);
  });

  it("counts interest paid separately from principal", () => {
    const borrowing = makeBorrowing({ interestBasis: "OUTSTANDING_PRINCIPAL" });
    const repayments = [
      makeRepayment({
        amount: 1200,
        interestComponent: 200,
        principalComponent: 1000,
        date: "2026-02-01",
      }),
    ];

    const summary = summarizeBorrowing(borrowing, repayments, "2026-02-01");

    expect(summary.interestPaid).toBe(200);
    expect(summary.principalPaid).toBe(1000);
    expect(summary.outstandingInterest).toBe(0);
    expect(summary.outstandingPrincipal).toBe(19000);
  });

  it("works for a borrowing with no credited account", () => {
    const borrowing = makeBorrowing({ creditedAccountId: null });
    const summary = summarizeBorrowing(borrowing, [], "2026-02-01");
    expect(summary.outstandingPrincipal).toBe(20000);
    expect(summary.interestAccrued).toBe(200);
  });
});

describe("allocateRepayment", () => {
  it("clears interest before principal", () => {
    const allocation = allocateRepayment(1000, {
      outstandingInterest: 200,
      outstandingPrincipal: 20000,
    });

    expect(allocation.interestComponent).toBe(200);
    expect(allocation.principalComponent).toBe(800);
    expect(allocation.overpayment).toBe(0);
  });

  it("puts everything on principal when no interest is owed", () => {
    const allocation = allocateRepayment(5000, {
      outstandingInterest: 0,
      outstandingPrincipal: 20000,
    });

    expect(allocation.interestComponent).toBe(0);
    expect(allocation.principalComponent).toBe(5000);
  });

  it("reports the excess when paying more than is owed", () => {
    const allocation = allocateRepayment(1500, {
      outstandingInterest: 100,
      outstandingPrincipal: 1000,
    });

    expect(allocation.interestComponent).toBe(100);
    expect(allocation.principalComponent).toBe(1000);
    expect(allocation.overpayment).toBe(400);
  });
});

describe("validateRepayment", () => {
  const owed = { outstandingInterest: 200, outstandingPrincipal: 10000 };

  it("rejects zero and negative amounts", () => {
    expect(validateRepayment(0, owed).ok).toBe(false);
    expect(validateRepayment(-50, owed).ok).toBe(false);
  });

  it("accepts an amount within the outstanding total", () => {
    expect(validateRepayment(10200, owed).ok).toBe(true);
  });

  it("blocks accidental overpayment by default", () => {
    const result = validateRepayment(10201, owed);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("exceeds");
  });

  it("allows overpayment when explicitly opted in", () => {
    expect(validateRepayment(99999, owed, { allowOverpayment: true }).ok).toBe(
      true
    );
  });

  it("rejects any repayment on a settled borrowing", () => {
    const result = validateRepayment(100, {
      outstandingInterest: 0,
      outstandingPrincipal: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already fully settled");
  });
});

describe("describeInterest", () => {
  it("labels each supported frequency", () => {
    expect(describeInterest(makeBorrowing())).toBe("12% annual interest");
    expect(
      describeInterest(makeBorrowing({ interestFrequency: "MONTHLY", interestRate: 1 }))
    ).toBe("1% monthly interest");
    expect(
      describeInterest(makeBorrowing({ interestFrequency: "ONE_TIME", interestRate: 5 }))
    ).toBe("5% one-time interest");
  });

  it("labels interest-free and zero-rate borrowings", () => {
    expect(
      describeInterest(
        makeBorrowing({ interestType: "NONE", interestFrequency: "NONE" })
      )
    ).toBe("No interest");
    expect(describeInterest(makeBorrowing({ interestRate: 0 }))).toBe("No interest");
  });
});

describe("summarizeBorrowings", () => {
  it("totals borrowed, outstanding, interest and repaid across borrowings", () => {
    const borrowings = [
      makeBorrowing({
        id: "b1",
        principalAmount: 20000,
        interestType: "NONE",
        interestFrequency: "NONE",
        interestRate: 0,
      }),
      makeBorrowing({
        id: "b2",
        principalAmount: 10000,
        interestType: "NONE",
        interestFrequency: "NONE",
        interestRate: 0,
      }),
    ];
    const repayments = [
      makeRepayment({ id: "r1", borrowingId: "b1", amount: 5000, principalComponent: 5000 }),
      makeRepayment({ id: "r2", borrowingId: "b2", amount: 10000, principalComponent: 10000 }),
    ];

    const totals = summarizeBorrowings(borrowings, repayments, "2026-03-01");

    expect(totals.totalBorrowed).toBe(30000);
    expect(totals.totalRepaid).toBe(15000);
    expect(totals.totalOutstanding).toBe(15000);
    expect(totals.activeCount).toBe(1);
    expect(totals.settledCount).toBe(1);
  });

  it("returns zeroes for an empty portfolio", () => {
    const totals = summarizeBorrowings([], [], "2026-03-01");
    expect(totals.totalBorrowed).toBe(0);
    expect(totals.totalOutstanding).toBe(0);
    expect(totals.activeCount).toBe(0);
  });

  it("counts overdue borrowings", () => {
    const borrowings = [makeBorrowing({ dueDate: "2026-01-15" })];
    const totals = summarizeBorrowings(borrowings, [], "2026-03-01");
    expect(totals.overdueCount).toBe(1);
  });
});
