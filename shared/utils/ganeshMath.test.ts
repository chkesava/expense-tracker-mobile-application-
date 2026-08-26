import { describe, expect, it } from "vitest";

import {
  applyPermanentFundDelta,
  assetPurchaseAmountOf,
  availableGodFund,
  deriveHouseholdStatus,
  festivalCashSpent,
  festivalCollectedCash,
  memberPendingReimbursement,
  possibleHouseholdDuplicates,
  regularExpenseAmount,
  summarizeLedger,
  totalExpenses,
  validateCollection,
  validateExpenseFunding,
  validateFundTransfer,
  validateGodFundSpend,
  validateInKindValue,
  validateReimbursement,
  validateReimbursementReversal,
  validateSettlement,
  canManagePandal,
  committeePayStatus,
  effectiveCommitteeTarget,
} from "./ganeshMath";
import { EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";

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

  it("subtracts cash returned to the Permanent Fund and does not treat it as an expense", () => {
    expect(
      availableGodFund({
        openingFunds: 10000,
        chanda: 80000,
        committeeContributions: 20000,
        otherCashContributions: 10000,
        godFundExpenses: 90000,
        reimbursements: 5000,
        transferredToPermanentFund: 20000,
      })
    ).toBe(5000);
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

describe("validateGodFundSpend", () => {
  it("allows a personal or sponsored expense that uses no God Fund", () => {
    expect(validateGodFundSpend(0, 0)).toEqual({ ok: true });
  });

  it("rejects a God Fund spend larger than the available balance", () => {
    const result = validateGodFundSpend(500, 200);
    expect(result.ok).toBe(false);
  });

  it("accepts a God Fund spend within the available balance", () => {
    expect(validateGodFundSpend(200, 500)).toEqual({ ok: true });
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
    expect(summary.transferredToPermanentFund).toBe(0);
    expect(festivalCollectedCash(summary)).toBe(5500);
    expect(festivalCashSpent(summary)).toBe(4000);
    expect(assetPurchaseAmountOf(summary)).toBe(0);
    expect(regularExpenseAmount(summary)).toBe(5000);
  });

  it("splits festival cash into regular vs asset-purchase spend", () => {
    const summary = summarizeLedger({
      openingFunds: [],
      collections: [],
      committeeContributions: [],
      otherCashContributions: [],
      godFundExpenses: [1500, 15000],
      reimbursements: [],
      personalAmounts: [0, 0],
      inKindValues: [],
      sponsoredValues: [],
      assetPurchaseAmounts: [15000],
    });
    expect(totalExpenses(summary)).toBe(16500);
    expect(assetPurchaseAmountOf(summary)).toBe(15000);
    expect(regularExpenseAmount(summary)).toBe(1500);
  });
});

describe("permanent fund math", () => {
  it("rejects a transfer larger than the available fund", () => {
    const result = validateFundTransfer(5000, 3000, "Permanent Fund");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("3000");
      expect(result.error).toContain("5000");
    }
  });

  it("accepts a partial settlement that sums to the closing balance", () => {
    expect(validateSettlement({ closing: 25000, transfer: 20000, remaining: 5000 })).toEqual({
      ok: true,
    });
  });

  it("rejects a settlement that exceeds the closing balance", () => {
    expect(validateSettlement({ closing: 25000, transfer: 30000, remaining: -5000 }).ok).toBe(
      false
    );
  });

  it("rejects a settlement whose parts do not sum to closing", () => {
    expect(validateSettlement({ closing: 25000, transfer: 20000, remaining: 4000 }).ok).toBe(
      false
    );
  });

  it("lets the Permanent Fund grow and shrink by location without going negative", () => {
    const afterIn = applyPermanentFundDelta(EMPTY_PERMANENT_FUND, "cash", 20000);
    expect(afterIn.ok).toBe(true);
    if (!afterIn.ok) return;
    expect(afterIn.next).toEqual({
      total: 20000,
      cash: 20000,
      upi: 0,
      bank: 0,
      other: 0,
    });
    const afterOut = applyPermanentFundDelta(afterIn.next, "cash", -5000);
    expect(afterOut.ok).toBe(true);
    if (!afterOut.ok) return;
    expect(afterOut.next.total).toBe(15000);
    expect(afterOut.next.cash).toBe(15000);
    const overdraw = applyPermanentFundDelta(afterOut.next, "upi", -1000);
    expect(overdraw.ok).toBe(false);
  });
});

describe("canManagePandal", () => {
  it("is admin-only and does not treat treasurer as admin", () => {
    expect(canManagePandal("admin")).toBe(true);
    expect(canManagePandal("treasurer")).toBe(false);
    expect(canManagePandal("member")).toBe(false);
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

describe("committeePayStatus", () => {
  it("marks unpaid committee people as pending", () => {
    expect(committeePayStatus(0, 500)).toBe("pending");
  });

  it("marks a part payment as partial and a full payment as paid", () => {
    expect(committeePayStatus(200, 500)).toBe("partial");
    expect(committeePayStatus(500, 500)).toBe("paid");
  });

  it("treats an overridden zero target as paid", () => {
    expect(committeePayStatus(0, 0, true)).toBe("paid");
  });
});

describe("effectiveCommitteeTarget", () => {
  it("uses the festival default until a person has a custom target", () => {
    expect(effectiveCommitteeTarget({ contributionTarget: 0 }, 500)).toBe(500);
    expect(
      effectiveCommitteeTarget({ contributionTarget: 100, contributionTargetOverridden: true }, 500)
    ).toBe(100);
  });

  it("allows a custom target of zero for a child who is not expected to pay", () => {
    expect(
      effectiveCommitteeTarget({ contributionTarget: 0, contributionTargetOverridden: true }, 500)
    ).toBe(0);
  });
});

// GS-009 — voiding or shrinking an expense whose personal portion was already
// reimbursed used to drive the counter negative, which then blocked the member
// from every future reimbursement.
describe("validateReimbursementReversal", () => {
  it("allows reversing personal money that is still outstanding", () => {
    expect(validateReimbursementReversal(1000, 1000).ok).toBe(true);
    expect(validateReimbursementReversal(400, 1000).ok).toBe(true);
    expect(validateReimbursementReversal(0, 0).ok).toBe(true);
  });

  it("refuses a reversal larger than what the member is still owed", () => {
    const result = validateReimbursementReversal(1000, 0);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("already been reimbursed");
  });

  it("names the amount that has to be un-reimbursed first", () => {
    const result = validateReimbursementReversal(1000, 400);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("600");
  });

  it("agrees with summarizeLedger, which clamps the same figure at zero", () => {
    // Expense of 1000 personal, fully reimbursed: ledger says pending 0, so a
    // 1000 reversal must be refused rather than producing -1000.
    const rebuilt = summarizeLedger({
      openingFunds: [],
      collections: [],
      committeeContributions: [],
      otherCashContributions: [],
      godFundExpenses: [],
      personalAmounts: [1000],
      reimbursements: [1000],
      inKindValues: [],
      sponsoredValues: [],
    });
    expect(rebuilt.pendingReimbursements).toBe(0);
    expect(validateReimbursementReversal(1000, rebuilt.pendingReimbursements).ok).toBe(false);
  });

  it("tolerates float dust rather than rejecting an exact reversal", () => {
    expect(validateReimbursementReversal(0.1 + 0.2, 0.3).ok).toBe(true);
  });
});
