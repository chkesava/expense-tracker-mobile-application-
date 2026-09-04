import { describe, expect, it } from "vitest";

import {
  applyFestivalLocationDelta,
  applyPermanentFundDelta,
  assetPurchaseAmountOf,
  availableGodFund,
  deriveHouseholdStatus,
  festivalCashSpent,
  festivalCollectedCash,
  closedFestivalResidue,
  festivalLocationTotal,
  money,
  formatCollectionReceipt,
  totalPandalFunds,
  godFundSpendableAt,
  unclassifiedGodFund,
  householdOverpayAmount,
  locationDelta,
  locationInvariantHolds,
  mapHouseholdForNewFestival,
  memberPendingReimbursement,
  parsePermanentFund,
  possibleDuplicateCollections,
  possibleHouseholdDuplicates,
  regularExpenseAmount,
  repairFestivalLocations,
  resolveFundLocation,
  summarizeLedger,
  totalExpenses,
  validateCollection,
  validateExpenseFunding,
  validateFundTransfer,
  validateGodFundLocationSpend,
  validateGodFundSpend,
  validateInKindValue,
  validateReimbursement,
  validateReimbursementReversal,
  validateSettlement,
  canManagePandal,
  committeePayStatus,
  effectiveCommitteeTarget,
  committeeContributionStatus,
  contributionAccountingKind,
} from "./ganeshMath";
import { EMPTY_GANESH_SUMMARY, EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";
import { roundMoney } from "@/shared/utils/money";

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

  it("keeps voluntary personal contributions out of the reimbursement obligation", () => {
    const summary = summarizeLedger({
      openingFunds: [],
      collections: [],
      committeeContributions: [],
      otherCashContributions: [],
      godFundExpenses: [],
      reimbursements: [],
      personalAmounts: [5000, 3000],
      reimbursementAmounts: [5000],
      inKindValues: [],
      sponsoredValues: [],
    });
    expect(summary.personalMoneyUsed).toBe(8000);
    expect(summary.pendingReimbursements).toBe(5000);
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

  it("derives a waived status without changing the paid amount", () => {
    expect(committeePayStatus(0, 500, false, true)).toBe("waived");
    expect(committeeContributionStatus({ contributionPaid: 0, contributionTarget: 500, contributionWaived: true })).toBe("waived");
  });
});

describe("contributionAccountingKind", () => {
  it("separates committee, other cash, in-kind, and sponsorship records", () => {
    expect(contributionAccountingKind({ kind: "money", isCommitteeContribution: true })).toBe("committee_cash");
    expect(contributionAccountingKind({ kind: "money", isCommitteeContribution: false })).toBe("other_cash");
    expect(contributionAccountingKind({ kind: "item" })).toBe("in_kind");
    expect(contributionAccountingKind({ kind: "sponsorship" })).toBe("sponsorship");
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

// GS-006 — a house paying in instalments used to produce a new household row per
// payment, so `paid` was unreachable. The merge branch in addCollection was
// always correct; nothing ever passed it a householdId.
describe("household instalments reach paid", () => {
  it("walks pending -> partial -> paid as one household accumulates", () => {
    const expectedAmount = 500;
    expect(deriveHouseholdStatus({ expectedAmount, collectedAmount: 0 })).toBe("pending");

    const afterFirst = 200;
    expect(deriveHouseholdStatus({ expectedAmount, collectedAmount: afterFirst })).toBe("partial");

    const afterSecond = afterFirst + 300;
    expect(deriveHouseholdStatus({ expectedAmount, collectedAmount: afterSecond })).toBe("paid");
  });

  it("keeps two separate rows stuck on partial, which is the bug being fixed", () => {
    // Both payments as their own household: neither ever reaches the target.
    expect(deriveHouseholdStatus({ expectedAmount: 500, collectedAmount: 200 })).toBe("partial");
    expect(deriveHouseholdStatus({ expectedAmount: 500, collectedAmount: 300 })).toBe("partial");
  });

  it("keeps not_interested only when no money has been collected yet", () => {
    expect(
      deriveHouseholdStatus({
        expectedAmount: 500,
        collectedAmount: 0,
        forcedStatus: "not_interested",
      })
    ).toBe("not_interested");
  });

  it("clears not_available once money is received", () => {
    expect(
      deriveHouseholdStatus({
        expectedAmount: 500,
        collectedAmount: 200,
        forcedStatus: "not_available",
      })
    ).toBe("partial");
  });

  it("treats an overpayment against the target as paid", () => {
    expect(deriveHouseholdStatus({ expectedAmount: 500, collectedAmount: 800 })).toBe("paid");
  });
});

// GS-007 — the settlement screen could close a festival on a summary that had not
// loaded yet, reporting "Closing cash ₹0" while the real balance was stranded.
// The server now checks the remaining amount the client claims against its own
// read of the summary, which is exactly this comparison.
describe("settlement rejects a claim that disagrees with the server balance", () => {
  it("rejects closing with a zero claim when the festival really holds money", () => {
    expect(validateSettlement({ closing: 50000, transfer: 0, remaining: 0 }).ok).toBe(false);
  });

  it("still allows deliberately leaving the whole balance in the festival", () => {
    expect(validateSettlement({ closing: 50000, transfer: 0, remaining: 50000 }).ok).toBe(true);
  });

  it("allows a genuinely empty festival to close on zeros", () => {
    expect(validateSettlement({ closing: 0, transfer: 0, remaining: 0 }).ok).toBe(true);
  });

  it("allows a full transfer that leaves nothing behind", () => {
    expect(validateSettlement({ closing: 50000, transfer: 50000, remaining: 0 }).ok).toBe(true);
  });
});

describe("festival Cash / UPI / Bank", () => {
  it("treats a missing payment method as other", () => {
    expect(resolveFundLocation(undefined)).toBe("other");
    expect(resolveFundLocation("cash")).toBe("cash");
  });

  it("repairs unclassified God Fund into other so locations equal available cash", () => {
    const repaired = repairFestivalLocations({
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 10000,
    });
    expect(festivalLocationTotal(repaired)).toBe(10000);
    expect(repaired.other).toBe(10000);
  });

  it("refuses to overspend a location even when total God Fund is enough", () => {
    const summary = {
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 10000,
      cash: 2000,
      upi: 8000,
    };
    expect(availableGodFund(summary)).toBe(10000);
    expect(validateGodFundLocationSpend(3000, "cash", summary).ok).toBe(false);
    expect(validateGodFundLocationSpend(3000, "upi", summary).ok).toBe(true);
  });

  it("lets a festival spend money that predates location tracking", () => {
    // The reported bug: buckets shipped after this festival had already
    // collected, nothing backfilled them, so every Cash/UPI/Bank spend was
    // refused while the festival plainly held money.
    const legacy = {
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 20000,
      chanda: 26911,
    };
    expect(availableGodFund(legacy)).toBe(46911);
    expect(unclassifiedGodFund(legacy)).toBe(46911);
    expect(godFundSpendableAt("cash", legacy)).toBe(46911);
    expect(validateGodFundLocationSpend(222, "cash", legacy)).toEqual({ ok: true });
    expect(validateGodFundLocationSpend(222, "bank", legacy)).toEqual({ ok: true });
  });

  it("still caps an unclassified festival at what it actually holds", () => {
    const legacy = { ...EMPTY_GANESH_SUMMARY, chanda: 1000 };
    expect(validateGodFundLocationSpend(1001, "cash", legacy).ok).toBe(false);
  });

  it("enforces location limits once every rupee is classified", () => {
    const classified = {
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 10000,
      cash: 2000,
      upi: 8000,
    };
    expect(unclassifiedGodFund(classified)).toBe(0);
    expect(godFundSpendableAt("cash", classified)).toBe(2000);
    expect(validateGodFundLocationSpend(3000, "cash", classified).ok).toBe(false);
  });

  it("keeps unclassified money spendable after a location is overdrawn", () => {
    // Spending unclassified money as cash drives the cash bucket negative.
    // That is the honest record of the draw, and must not wedge later spends.
    const drawn = {
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 20000,
      chanda: 26911,
      godFundExpenses: 222,
      cash: -222,
    };
    expect(availableGodFund(drawn)).toBe(46689);
    expect(unclassifiedGodFund(drawn)).toBe(46911);
    expect(godFundSpendableAt("cash", drawn)).toBe(46689);
    expect(validateGodFundLocationSpend(100, "cash", drawn)).toEqual({ ok: true });
    expect(validateGodFundLocationSpend(46690, "cash", drawn).ok).toBe(false);
  });

  it("shows an overdrawn location as empty rather than negative", () => {
    const repaired = repairFestivalLocations({
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 20000,
      chanda: 26911,
      godFundExpenses: 222,
      cash: -222,
    });
    expect(repaired.cash).toBe(0);
    expect(festivalLocationTotal(repaired)).toBe(46689);
  });

  it("does not let a personal-sized spend move locations when god amount is zero", () => {
    expect(
      validateGodFundLocationSpend(0, "cash", {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 10000,
        cash: 0,
      })
    ).toEqual({ ok: true });
  });

  it("keeps location increments off personal money in summarizeLedger", () => {
    const summary = summarizeLedger({
      openingFunds: [10000],
      collections: [5000],
      committeeContributions: [],
      otherCashContributions: [],
      godFundExpenses: [3000],
      reimbursements: [],
      personalAmounts: [2000],
      inKindValues: [15000],
      sponsoredValues: [],
      locationDeltas: [
        { location: "cash", amount: 10000 },
        { location: "upi", amount: 5000 },
        { location: "cash", amount: -3000 },
      ],
    });
    expect(availableGodFund(summary)).toBe(12000);
    expect(summary.cash).toBe(7000);
    expect(summary.upi).toBe(5000);
    expect(locationInvariantHolds(summary)).toBe(true);
    expect(summary.inKindValue).toBe(15000);
  });

  it("repairs Permanent Fund total to match its parts", () => {
    const repaired = parsePermanentFund({
      total: 20000,
      cash: 12000,
      upi: 5000,
      bank: 0,
      other: 0,
    });
    expect(repaired.other).toBe(3000);
    expect(repaired.total).toBe(20000);
    expect(repaired.cash + repaired.upi + repaired.bank + repaired.other).toBe(20000);
  });

  it("rejects a location overdraft on applyFestivalLocationDelta", () => {
    const result = applyFestivalLocationDelta({ cash: 500, upi: 0, bank: 0, other: 0 }, "cash", -600);
    expect(result.ok).toBe(false);
  });

  it("builds a single-key location bump", () => {
    expect(locationDelta("upi", 250)).toEqual({ upi: 250 });
    expect(locationDelta("cash", 0)).toEqual({});
  });
});

describe("collection receipts and coverage helpers", () => {
  it("formats receipt numbers as GNS{YY}-{NNNNNN}", () => {
    expect(formatCollectionReceipt(2026, 182)).toBe("GNS26-000182");
    expect(formatCollectionReceipt(1999, 1)).toBe("GNS99-000001");
  });

  it("reports overpay above the household expected target", () => {
    expect(
      householdOverpayAmount({
        expectedAmount: 500,
        collectedAmount: 400,
        thisAmount: 200,
      })
    ).toBe(100);
    expect(
      householdOverpayAmount({
        expectedAmount: 500,
        collectedAmount: 100,
        thisAmount: 200,
      })
    ).toBe(0);
    expect(
      householdOverpayAmount({
        expectedAmount: 0,
        collectedAmount: 0,
        thisAmount: 900,
      })
    ).toBe(0);
  });

  it("flags same-house same-day similar-amount collections as duplicates", () => {
    const matches = possibleDuplicateCollections(
      [
        {
          id: "c1",
          householdId: "h1",
          donorName: "Ravi",
          houseNumber: "12",
          amount: 500,
          date: "2026-08-31",
          collectorId: "u1",
          receiptNumber: "GNS26-000001",
        },
      ],
      {
        householdId: "h1",
        donorName: "Ravi",
        houseNumber: "12",
        amount: 500,
        date: "2026-08-31",
      }
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].receiptNumber).toBe("GNS26-000001");
  });

  it("does not flag a legitimate next-day instalment as a duplicate", () => {
    const matches = possibleDuplicateCollections(
      [
        {
          id: "c1",
          householdId: "h1",
          donorName: "Ravi",
          houseNumber: "12",
          amount: 200,
          date: "2026-08-30",
          collectorId: "u1",
        },
      ],
      {
        householdId: "h1",
        donorName: "Ravi",
        houseNumber: "12",
        amount: 300,
        date: "2026-08-31",
      }
    );
    expect(matches).toHaveLength(0);
  });

  it("copies household identity into a new festival without collectedAmount", () => {
    const seeded = mapHouseholdForNewFestival(
      {
        name: "House 12",
        houseNumber: "12",
        mobile: "9999999999",
        area: "Main Road",
        notes: "Gate left",
        expectedAmount: 750,
        status: "paid",
        collectedAmount: 750,
      },
      500
    );
    expect(seeded.collectedAmount).toBe(0);
    expect(seeded.expectedAmount).toBe(750);
    expect(seeded.status).toBe("pending");
    expect(seeded.area).toBe("Main Road");
  });

  it("keeps not_interested when carrying households forward", () => {
    const seeded = mapHouseholdForNewFestival(
      { name: "Declined", expectedAmount: 0, status: "not_interested", collectedAmount: 0 },
      500
    );
    expect(seeded.status).toBe("not_interested");
    expect(seeded.expectedAmount).toBe(500);
    expect(seeded.collectedAmount).toBe(0);
  });
});

describe("closed festival residue (GS-022)", () => {
  const withBalance = (openingFunds: number) => ({ ...EMPTY_GANESH_SUMMARY, openingFunds });

  it("counts money left in closed festivals, and ignores open ones", () => {
    const festivals = [
      { id: "f1", status: "closed" },
      { id: "f2", status: "closed" },
      { id: "f3", status: "open" },
    ];
    const summaries = {
      f1: withBalance(5000),
      f2: withBalance(1200),
      // The live festival is counted separately, not here.
      f3: withBalance(9999),
    };
    expect(closedFestivalResidue(festivals, summaries)).toBe(6200);
  });

  it("is zero when every closed festival was fully settled", () => {
    expect(
      closedFestivalResidue(
        [{ id: "f1", status: "closed" }],
        { f1: { ...EMPTY_GANESH_SUMMARY, openingFunds: 5000, transferredToPermanentFund: 5000 } }
      )
    ).toBe(0);
  });

  it("ignores a festival whose summary has not loaded", () => {
    expect(closedFestivalResidue([{ id: "f1", status: "closed" }], {})).toBe(0);
  });

  it("never lets a negative closing balance net away real money", () => {
    // A negative balance is drift, not cash. Summing it would quietly reduce
    // the Pandal's stated holdings by a bug.
    const festivals = [
      { id: "f1", status: "closed" },
      { id: "f2", status: "closed" },
    ];
    const summaries = {
      f1: withBalance(5000),
      f2: { ...EMPTY_GANESH_SUMMARY, godFundExpenses: 800 },
    };
    expect(availableGodFund(summaries.f2)).toBe(-800);
    expect(closedFestivalResidue(festivals, summaries)).toBe(5000);
  });

  it("adds up everything the Pandal holds", () => {
    expect(
      totalPandalFunds({
        permanentFundTotal: 20000,
        activeFestivalGodFund: 46911,
        closedFestivalResidue: 6200,
      })
    ).toBe(73111);
  });
});

describe("money() and the split validators (GS-080)", () => {
  it("uses one rounding implementation", () => {
    expect(money(0.145)).toBe(roundMoney(0.145));
    expect(money(1.005)).toBe(roundMoney(1.005));
    expect(money(8.165)).toBe(roundMoney(8.165));
  });

  it("leaves ordinary two-decimal amounts exactly where they were", () => {
    // The regression risk of touching the rounding at all.
    for (const value of [0, 1, 0.1, 0.5, 99.99, 222, 26911, 46911.5, 1000.05]) {
      expect(money(value)).toBe(Math.round(value * 100) / 100);
    }
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(26911 + 20000)).toBe(46911);
  });

  it("accepts a balanced split whose parts each need rounding", () => {
    // The real defect: each component was rounded before summing, so three
    // rounded parts did not equal the rounded whole and a balanced expense was
    // refused. 2.725 rounds to 2.72, so the parts summed to 8.16 against a
    // total of 8.17.
    expect(
      validateExpenseFunding({
        totalAmount: 8.175,
        godFundAmount: 2.725,
        personalAmount: 2.725,
        sponsoredAmount: 2.725,
      })
    ).toEqual({ ok: true });
  });

  it("still refuses a split that is genuinely off by a paise", () => {
    expect(
      validateExpenseFunding({
        totalAmount: 100.01,
        godFundAmount: 50,
        personalAmount: 50,
        sponsoredAmount: 0,
      }).ok
    ).toBe(false);
  });

  it("applies the same correction to festival settlement", () => {
    expect(
      validateSettlement({ closing: 8.175, transfer: 2.725, remaining: 5.45 })
    ).toEqual({ ok: true });
    // A real mismatch is still caught.
    expect(validateSettlement({ closing: 100, transfer: 50, remaining: 49 }).ok).toBe(false);
  });
});
