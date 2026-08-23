import { describe, expect, it } from "vitest";

import {
  availableGodFund,
  deriveHouseholdStatus,
  memberPendingReimbursement,
  possibleHouseholdDuplicates,
  summarizeLedger,
  validateCollection,
  validateExpenseFunding,
  validateInKindValue,
  validateReimbursement,
} from "./ganeshMath";

describe("availableGodFund", () => {
  it("adds opening funds and cash inflows, subtracts god-fund expenses and reimbursements", () => {
    expect(
      availableGodFund({
        openingFunds: 10000,
        chanda: 35000,
        committeeContributions: 20000,
        otherCashContributions: 5000,
        godFundExpenses: 24500,
        reimbursements: 0,
      })
    ).toBe(45500);
  });

  it("does not subtract personal money until reimbursement", () => {
    expect(
      availableGodFund({
        openingFunds: 10000,
        chanda: 0,
        committeeContributions: 0,
        otherCashContributions: 0,
        godFundExpenses: 0,
        reimbursements: 0,
      })
    ).toBe(10000);
  });

  it("reduces god fund when a reimbursement is recorded", () => {
    expect(
      availableGodFund({
        openingFunds: 10000,
        chanda: 0,
        committeeContributions: 0,
        otherCashContributions: 0,
        godFundExpenses: 0,
        reimbursements: 1000,
      })
    ).toBe(9000);
  });
});

describe("validateExpenseFunding", () => {
  it("accepts a split-funded expense", () => {
    expect(
      validateExpenseFunding({
        totalAmount: 5000,
        godFundAmount: 3000,
        personalAmount: 2000,
      })
    ).toEqual({ ok: true });
  });

  it("accepts sponsored funding as the third leg", () => {
    expect(
      validateExpenseFunding({
        totalAmount: 10000,
        godFundAmount: 0,
        personalAmount: 0,
        sponsoredAmount: 10000,
      })
    ).toEqual({ ok: true });
  });

  it("rejects when parts do not sum to total", () => {
    const result = validateExpenseFunding({
      totalAmount: 5000,
      godFundAmount: 3000,
      personalAmount: 1000,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateReimbursement", () => {
  it("rejects more than pending personal expense", () => {
    const result = validateReimbursement(1500, 1000);
    expect(result.ok).toBe(false);
  });

  it("accepts a partial reimbursement", () => {
    expect(validateReimbursement(1000, 2000)).toEqual({ ok: true });
  });
});

describe("validateCollection", () => {
  it("rejects zero and negative amounts", () => {
    expect(validateCollection(0).ok).toBe(false);
    expect(validateCollection(-10).ok).toBe(false);
  });
});

describe("validateInKindValue", () => {
  it("allows zero estimated value and rejects negatives", () => {
    expect(validateInKindValue(0)).toEqual({ ok: true });
    expect(validateInKindValue(-1).ok).toBe(false);
  });
});

describe("deriveHouseholdStatus", () => {
  it("marks partial when collected is below expected", () => {
    expect(deriveHouseholdStatus({ expectedAmount: 500, collectedAmount: 300 })).toBe(
      "partial"
    );
  });

  it("marks paid when collected meets expected", () => {
    expect(deriveHouseholdStatus({ expectedAmount: 500, collectedAmount: 500 })).toBe(
      "paid"
    );
  });
});

describe("memberPendingReimbursement", () => {
  it("keeps contribution and personal money independent", () => {
    expect(
      memberPendingReimbursement({ personalExpenses: 3000, reimbursed: 1000 })
    ).toBe(2000);
  });
});

describe("summarizeLedger", () => {
  it("does not let in-kind value increase cash", () => {
    const summary = summarizeLedger({
      openingFunds: [10000],
      collections: [500],
      committeeContributions: [5000],
      otherCashContributions: [],
      godFundExpenses: [3000],
      reimbursements: [1000],
      personalAmounts: [2000],
      inKindValues: [12000, 4000],
      sponsoredValues: [10000],
    });
    expect(availableGodFund(summary)).toBe(11500);
    expect(summary.inKindValue).toBe(16000);
    expect(summary.pendingReimbursements).toBe(1000);
    expect(summary.chanda).toBe(500);
  });
});

describe("possibleHouseholdDuplicates", () => {
  it("warns on matching house number without blocking", () => {
    const matches = possibleHouseholdDuplicates(
      [{ id: "1", name: "Ramesh Kumar", houseNumber: "12", mobile: "9876543210" }],
      { name: "Ramesh", houseNumber: "12" }
    );
    expect(matches).toHaveLength(1);
  });
});
