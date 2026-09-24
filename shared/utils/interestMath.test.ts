import { describe, expect, it } from "vitest";

import {
  accrueInterest,
  allocateInterestFirst,
  describeInterestTerms,
  elapsedMonths,
  monthlyRateOf,
  movementsUpTo,
  validatePayment,
  type InterestPosition,
  type InterestTerms,
} from "./interestMath";

function terms(overrides: Partial<InterestTerms> = {}): InterestTerms {
  return {
    rate: 12,
    type: "SIMPLE",
    frequency: "ANNUAL",
    basis: "ORIGINAL_PRINCIPAL",
    ...overrides,
  };
}

function position(overrides: Partial<InterestPosition> = {}): InterestPosition {
  return {
    principal: 20000,
    startDate: "2026-01-01",
    terms: terms(),
    ...overrides,
  };
}

describe("elapsedMonths", () => {
  it("is exactly 1 at a calendar month boundary", () => {
    expect(elapsedMonths("2026-01-01", "2026-02-01")).toBe(1);
    expect(elapsedMonths("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("returns 0 when the end is on or before the start", () => {
    expect(elapsedMonths("2026-01-01", "2026-01-01")).toBe(0);
    expect(elapsedMonths("2026-03-01", "2026-01-01")).toBe(0);
  });

  it("expresses a partial month as a fraction of that month's own length", () => {
    // 15 days into a 31-day January.
    expect(elapsedMonths("2026-01-01", "2026-01-16")).toBeCloseTo(15 / 31, 6);
  });

  it("clamps month-end anchors across shorter months", () => {
    expect(elapsedMonths("2026-01-31", "2026-02-28")).toBe(1);
  });

  it("counts whole years as twelve months", () => {
    expect(elapsedMonths("2026-01-01", "2027-01-01")).toBe(12);
  });
});

describe("monthlyRateOf", () => {
  it("converts by frequency", () => {
    expect(monthlyRateOf(terms({ rate: 1, frequency: "MONTHLY" }))).toBeCloseTo(0.01, 10);
    expect(monthlyRateOf(terms({ rate: 12, frequency: "ANNUAL" }))).toBeCloseTo(0.01, 10);
  });

  it("is zero for one-time and interest-free terms", () => {
    expect(monthlyRateOf(terms({ frequency: "ONE_TIME" }))).toBe(0);
    expect(monthlyRateOf(terms({ frequency: "NONE" }))).toBe(0);
    expect(monthlyRateOf(terms({ type: "NONE" }))).toBe(0);
    expect(monthlyRateOf(terms({ rate: 0 }))).toBe(0);
  });
});

describe("movementsUpTo", () => {
  it("drops later rows and sorts the rest", () => {
    const rows = [
      { date: "2026-03-01" },
      { date: "2026-01-01" },
      { date: "2026-09-01" },
    ];
    expect(movementsUpTo(rows, "2026-06-01").map((r) => r.date)).toEqual([
      "2026-01-01",
      "2026-03-01",
    ]);
  });
});

describe("accrueInterest", () => {
  it("charges nothing on interest-free terms", () => {
    expect(
      accrueInterest(position({ terms: terms({ type: "NONE" }) }), [], "2027-01-01")
    ).toBe(0);
  });

  it("charges nothing before the position starts", () => {
    expect(accrueInterest(position(), [], "2025-12-01")).toBe(0);
  });

  it("charges nothing on the start date itself", () => {
    expect(accrueInterest(position(), [], "2026-01-01")).toBe(0);
  });

  it("charges a one-time rate once, whatever the elapsed time", () => {
    const p = position({
      principal: 10000,
      terms: terms({ rate: 5, frequency: "ONE_TIME" }),
    });
    expect(accrueInterest(p, [], "2026-02-01")).toBe(500);
    expect(accrueInterest(p, [], "2056-02-01")).toBe(500);
  });

  it("ignores movements when the basis is the original principal", () => {
    const p = position({
      principal: 20000,
      terms: terms({ rate: 1, frequency: "MONTHLY", basis: "ORIGINAL_PRINCIPAL" }),
    });
    const movements = [{ date: "2026-02-01", principalComponent: 10000 }];
    // 20000 * 1% * 3 months, the repayment notwithstanding.
    expect(accrueInterest(p, movements, "2026-04-01")).toBe(600);
  });

  it("charges only what was still owed when the basis is outstanding principal", () => {
    const p = position({
      principal: 20000,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [{ date: "2026-02-01", principalComponent: 10000 }];
    // 20000 for month 1, then 10000 for months 2 and 3.
    expect(accrueInterest(p, movements, "2026-04-01")).toBe(400);
  });

  it("segments the timeline across multiple movements", () => {
    const p = position({
      principal: 20000,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [
      { date: "2026-02-01", principalComponent: 5000 },
      { date: "2026-03-01", principalComponent: 5000 },
    ];
    // 20000 for month 1, 15000 for month 2, 10000 for month 3.
    expect(accrueInterest(p, movements, "2026-04-01")).toBe(450);
  });

  it("rounds once at the end, not per segment", () => {
    // The invariant the borrowing suite also pins: segments of 33.3333 and
    // 22.2222 sum to 55.5555 -> 55.56. Rounded per segment it would be 55.55.
    const p = position({
      principal: 3333.33,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [{ date: "2026-02-01", principalComponent: 1111.11 }];
    expect(accrueInterest(p, movements, "2026-03-01")).toBe(55.56);
  });

  it("never runs the timeline backwards for an early-dated movement", () => {
    const p = position({
      principal: 10000,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [{ date: "2025-06-01", principalComponent: 4000 }];
    expect(accrueInterest(p, movements, "2026-02-01")).toBe(60);
  });

  it("floors an overpaid balance at zero rather than charging negative interest", () => {
    const p = position({
      principal: 10000,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [{ date: "2026-02-01", principalComponent: 15000 }];
    expect(accrueInterest(p, movements, "2026-06-01")).toBe(100);
  });

  it("ignores movements dated after the as-of date", () => {
    const p = position({
      principal: 20000,
      terms: terms({
        rate: 1,
        frequency: "MONTHLY",
        basis: "OUTSTANDING_PRINCIPAL",
      }),
    });
    const movements = [{ date: "2026-05-01", principalComponent: 20000 }];
    expect(accrueInterest(p, movements, "2026-02-01")).toBe(200);
  });
});

describe("describeInterestTerms", () => {
  it("labels each frequency", () => {
    expect(describeInterestTerms(terms({ rate: 1, frequency: "MONTHLY" }))).toBe(
      "1% monthly interest"
    );
    expect(describeInterestTerms(terms({ rate: 12, frequency: "ANNUAL" }))).toBe(
      "12% annual interest"
    );
    expect(describeInterestTerms(terms({ rate: 5, frequency: "ONE_TIME" }))).toBe(
      "5% one-time interest"
    );
  });

  it("labels interest-free and zero-rate terms", () => {
    expect(describeInterestTerms(terms({ type: "NONE" }))).toBe("No interest");
    expect(describeInterestTerms(terms({ frequency: "NONE" }))).toBe("No interest");
    expect(describeInterestTerms(terms({ rate: 0 }))).toBe("No interest");
  });
});

describe("allocateInterestFirst", () => {
  const owed = { outstandingInterest: 200, outstandingPrincipal: 1000 };

  it("clears interest before principal", () => {
    expect(allocateInterestFirst(500, owed)).toEqual({
      interestComponent: 200,
      principalComponent: 300,
      overpayment: 0,
    });
  });

  it("applies a small payment entirely to interest", () => {
    expect(allocateInterestFirst(150, owed)).toEqual({
      interestComponent: 150,
      principalComponent: 0,
      overpayment: 0,
    });
  });

  it("reports the excess rather than inflating either component", () => {
    expect(allocateInterestFirst(1500, owed)).toEqual({
      interestComponent: 200,
      principalComponent: 1000,
      overpayment: 300,
    });
  });
});

describe("validatePayment", () => {
  const owed = { outstandingInterest: 200, outstandingPrincipal: 1000 };

  it("rejects a non-positive amount", () => {
    expect(validatePayment(0, owed).ok).toBe(false);
    expect(validatePayment(Number.NaN, owed).ok).toBe(false);
  });

  it("names the subject in the settled message", () => {
    const settled = { outstandingInterest: 0, outstandingPrincipal: 0 };
    expect(validatePayment(100, settled, { subject: "borrowing" }).error).toBe(
      "This borrowing is already fully settled."
    );
    expect(validatePayment(100, settled, { subject: "receivable" }).error).toBe(
      "This receivable is already fully settled."
    );
  });

  it("blocks overpayment against principal plus interest, unless opted in", () => {
    expect(validatePayment(1300, owed).ok).toBe(false);
    expect(validatePayment(1200, owed).ok).toBe(true);
    expect(validatePayment(1300, owed, { allowOverpayment: true }).ok).toBe(true);
  });
});
