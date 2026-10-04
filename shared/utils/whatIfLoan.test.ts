import { describe, expect, it } from "vitest";

import { simulateWhatIfLoan, type WhatIfLoanInput } from "./whatIfLoan";

const provenance = { kind: "user" as const, source: "what-if-form", asOfDate: "2026-10-04" };
const loan = (overrides: Partial<WhatIfLoanInput> = {}): WhatIfLoanInput => ({
  id: "loan-1",
  label: "Phone loan",
  principal: 120000,
  annualInterestRatePct: 12,
  tenureMonths: 12,
  frequency: "monthly",
  startDate: "2026-10-04",
  provenance,
  ...overrides,
});

describe("What-If loan simulation", () => {
  it("calculates a deterministic reducing-balance EMI and reconciles totals", () => {
    const result = simulateWhatIfLoan(loan());
    expect(result.issues).toEqual([]);
    expect(result.paymentAmount).toBe(10661.85);
    expect(result.payments).toHaveLength(12);
    expect(result.totalInterest).toBe(7942.26);
    expect(result.payments.at(-1)?.closingPrincipal).toBe(0);
    expect(result.totalRepayment).toBeCloseTo(result.financedPrincipal + result.totalInterest, 1);
  });

  it("handles zero interest without dividing by zero", () => {
    const result = simulateWhatIfLoan(loan({ principal: 12000, annualInterestRatePct: 0, tenureMonths: 12 }));
    expect(result.issues).toEqual([]);
    expect(result.paymentAmount).toBe(1000);
    expect(result.totalInterest).toBe(0);
    expect(result.totalRepayment).toBe(12000);
  });

  it("models down payment, fees and repayment as separate hypothetical adjustments", () => {
    const result = simulateWhatIfLoan(loan({ principal: 100000, downPayment: 20000, fees: 500, tenureMonths: 6 }));
    expect(result.financedPrincipal).toBe(80000);
    expect(result.upfrontCashOutflow).toBe(20500);
    expect(result.adjustments.map((adjustment) => adjustment.id)).toEqual([
      "what-if:loan-1:funding",
      "what-if:loan-1:repayment",
      "what-if:loan-1:down-payment",
      "what-if:loan-1:fees",
    ]);
    expect(result.adjustments.every((adjustment) => adjustment.provenance.kind === "user")).toBe(true);
  });

  it("supports weekly frequency with a deterministic end date", () => {
    const result = simulateWhatIfLoan(loan({ principal: 5200, annualInterestRatePct: 0, tenureMonths: 1, frequency: "weekly" }));
    expect(result.issues).toEqual([]);
    expect(result.payments).toHaveLength(5);
    expect(result.endDate).toBe("2026-11-08");
    expect(result.adjustments[1]?.schedule).toMatchObject({ kind: "every_n_days", intervalDays: 7 });
  });

  it("rejects invalid rates, dates, tenure and down payments without producing adjustments", () => {
    const result = simulateWhatIfLoan(loan({ annualInterestRatePct: -1, startDate: "2026-02-30", tenureMonths: 0, downPayment: 130000 }));
    expect(result.adjustments).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([
      "downPayment cannot exceed principal",
      "annualInterestRatePct must be from 0 to 1000",
      "tenureMonths must be a whole number from 1 to 600",
      "startDate must be a valid date",
    ]));
  });
});
