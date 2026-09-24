import { describe, expect, it } from "vitest";

import type { Borrowing } from "@/shared/types/borrowing";
import type { BorrowingSummary } from "@/shared/utils/borrowingMath";

import {
  EMPTY_BORROWING_FILTERS,
  countActiveBorrowingFilters,
  matchesBorrowingFilters,
} from "./borrowingFilters";

const TODAY = "2026-09-24";

function borrowing(overrides: Partial<Borrowing> = {}): Borrowing {
  return {
    id: "b1",
    userId: "u1",
    lenderType: "FRIEND",
    lenderName: "Asha",
    principalAmount: 40000,
    interestRate: 0,
    interestType: "NONE",
    interestFrequency: "MONTHLY",
    interestBasis: "ORIGINAL_PRINCIPAL",
    borrowedDate: "2026-09-01",
    status: "ACTIVE",
    ...overrides,
  };
}

function summary(overrides: Partial<BorrowingSummary> = {}): BorrowingSummary {
  return {
    borrowingId: "b1",
    principalAmount: 40000,
    principalPaid: 0,
    outstandingPrincipal: 40000,
    interestAccrued: 0,
    interestPaid: 0,
    outstandingInterest: 0,
    totalPaid: 0,
    totalOutstanding: 40000,
    status: "ACTIVE",
    settledDate: null,
    isOverdue: false,
    repaymentCount: 0,
    ...overrides,
  };
}

function match(
  input: Partial<Parameters<typeof matchesBorrowingFilters>[0]> = {}
): boolean {
  return matchesBorrowingFilters({
    borrowing: borrowing(),
    summary: summary(),
    filters: EMPTY_BORROWING_FILTERS,
    query: "",
    today: TODAY,
    ...input,
  });
}

describe("matchesBorrowingFilters", () => {
  it("keeps everything when no filter is set", () => {
    expect(match()).toBe(true);
  });

  it("drops records with no id or no summary", () => {
    expect(match({ borrowing: borrowing({ id: undefined }) })).toBe(false);
    expect(match({ summary: undefined })).toBe(false);
  });

  it("treats 'outstanding' as a balance test, not a status test", () => {
    const filters = { ...EMPTY_BORROWING_FILTERS, status: "outstanding" as const };
    expect(match({ filters })).toBe(true);
    expect(
      match({
        filters,
        summary: summary({ totalOutstanding: 0, status: "FULLY_SETTLED" }),
      })
    ).toBe(false);
  });

  it("matches status against the derived summary, not the stored record", () => {
    const filters = { ...EMPTY_BORROWING_FILTERS, status: "OVERDUE" as const };
    // The stored record still says ACTIVE; the derived summary is what counts.
    expect(match({ filters, summary: summary({ status: "OVERDUE" }) })).toBe(true);
    expect(match({ filters })).toBe(false);
  });

  it("filters by lender type", () => {
    const filters = { ...EMPTY_BORROWING_FILTERS, lenderType: "BANK" };
    expect(match({ filters })).toBe(false);
    expect(match({ filters, borrowing: borrowing({ lenderType: "BANK" }) })).toBe(true);
  });

  it("filters by interest type", () => {
    const filters = { ...EMPTY_BORROWING_FILTERS, interest: "SIMPLE" as const };
    expect(match({ filters })).toBe(false);
    expect(match({ filters, borrowing: borrowing({ interestType: "SIMPLE" }) })).toBe(
      true
    );
  });

  it("filters by borrowed date against the range cutoff", () => {
    const filters = { ...EMPTY_BORROWING_FILTERS, date: "thisMonth" as const };
    expect(match({ filters })).toBe(true);
    expect(
      match({ filters, borrowing: borrowing({ borrowedDate: "2026-08-31" }) })
    ).toBe(false);
  });

  it("searches lender name and note, case-insensitively", () => {
    expect(match({ query: "ASH" })).toBe(true);
    expect(match({ query: "  asha  " })).toBe(true);
    expect(match({ query: "nobody" })).toBe(false);
    expect(match({ query: "roof", borrowing: borrowing({ note: "Roof repair" }) })).toBe(
      true
    );
  });

  it("requires every active dimension to pass, not any", () => {
    const filters = {
      ...EMPTY_BORROWING_FILTERS,
      lenderType: "BANK",
      interest: "SIMPLE" as const,
    };
    // Lender matches but interest does not.
    expect(match({ filters, borrowing: borrowing({ lenderType: "BANK" }) })).toBe(false);
    expect(
      match({
        filters,
        borrowing: borrowing({ lenderType: "BANK", interestType: "SIMPLE" }),
      })
    ).toBe(true);
  });
});

describe("countActiveBorrowingFilters", () => {
  it("counts only dimensions that are not 'all'", () => {
    expect(countActiveBorrowingFilters(EMPTY_BORROWING_FILTERS)).toBe(0);
    expect(
      countActiveBorrowingFilters({ ...EMPTY_BORROWING_FILTERS, status: "OVERDUE" })
    ).toBe(1);
    expect(
      countActiveBorrowingFilters({
        status: "ACTIVE",
        lenderType: "BANK",
        date: "thisYear",
        interest: "SIMPLE",
      })
    ).toBe(4);
  });
});
