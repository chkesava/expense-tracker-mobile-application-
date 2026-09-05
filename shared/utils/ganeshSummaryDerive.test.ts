import { describe, expect, it } from "vitest";

import {
  CARRIED_SUMMARY_FIELDS,
  DERIVED_SUMMARY_FIELDS,
  deriveFestivalSummary,
  deriveMemberTotals,
  summaryAuditDelta,
  type FestivalLedger,
  type LedgerDoc,
} from "@/shared/utils/ganeshSummaryDerive";
import { EMPTY_GANESH_SUMMARY } from "@/shared/types/ganesh";

/**
 * The derivation the trusted trigger runs (GS-004).
 *
 * These cases were carried over from `ganeshRecomputeAudit.test.ts`, which
 * tested the same logic while it still lived in the client's
 * `recomputeFestivalSummary`. The logic did not change when it moved; its home
 * did, and this is a better one — the rules are no longer in the way, so it can
 * be tested as the pure function it always was.
 */

const empty: FestivalLedger = {
  openingFunds: [],
  collections: [],
  contributions: [],
  expenses: [],
  reimbursements: [],
  fundTransfers: [],
};

const rows = (...data: Record<string, any>[]): LedgerDoc[] =>
  data.map((d, i) => ({ id: `d-${i}`, data: d }));

describe("deriveFestivalSummary", () => {
  it("sums collections into chanda and the matching cash bucket", () => {
    const summary = deriveFestivalSummary({
      ...empty,
      collections: rows({ amount: 5000, paymentMethod: "cash" }),
    });
    expect(summary.chanda).toBe(5000);
    expect(summary.collectionCount).toBe(1);
    expect(summary.cash).toBe(5000);
  });

  it("ignores a voided row", () => {
    const summary = deriveFestivalSummary({
      ...empty,
      collections: rows(
        { amount: 5000, paymentMethod: "cash" },
        { amount: 900, paymentMethod: "cash", voided: true }
      ),
    });
    expect(summary.chanda).toBe(5000);
  });

  it("treats a contribution with no status as promised, not as cash (GS-072)", () => {
    // The old recompute rolled its own predicate — "not cancelled and not
    // promised" — which counted an absent status as received, while
    // contributionStatusOf defaults it to promised. A statusless document was
    // invisible-as-promised in the UI and became cash the moment anyone
    // pressed "Recalculate from ledger".
    const summary = deriveFestivalSummary({
      ...empty,
      contributions: rows({ kind: "money", amount: 5000, isCommitteeContribution: false }),
    });
    expect(summary.otherCashContributions).toBe(0);
  });

  it("still counts an explicitly received contribution as cash", () => {
    const summary = deriveFestivalSummary({
      ...empty,
      contributions: rows({
        kind: "money",
        amount: 5000,
        status: "received",
        isCommitteeContribution: false,
      }),
    });
    expect(summary.otherCashContributions).toBe(5000);
  });

  it("keeps promised money out of the received totals", () => {
    const summary = deriveFestivalSummary({
      ...empty,
      contributions: rows({ kind: "money", amount: 2000, status: "promised" }),
    });
    expect(summary.otherCashContributions).toBe(0);
    expect(summary.promisedCashContributions).toBe(2000);
  });

  it("takes a God Fund expense back out of the bucket it was paid from", () => {
    const summary = deriveFestivalSummary({
      ...empty,
      collections: rows({ amount: 8000, paymentMethod: "upi" }),
      expenses: rows({ godFundAmount: 3000, paymentMethod: "upi" }),
    });
    expect(summary.godFundExpenses).toBe(3000);
    expect(summary.upi).toBe(5000);
  });

  it("carries the allocators rather than deriving them", () => {
    // Recomputing these would restart numbering and hand a receipt number
    // already read out to a donor to somebody else (GS-077).
    const summary = deriveFestivalSummary(empty, {
      nextReceiptNumber: 182,
      nextContributionNumber: 41,
    });
    expect(summary.nextReceiptNumber).toBe(182);
    expect(summary.nextContributionNumber).toBe(41);
  });

  it("defaults the allocators to zero when none are carried", () => {
    const summary = deriveFestivalSummary(empty);
    expect(summary.nextReceiptNumber).toBe(0);
    expect(summary.nextContributionNumber).toBe(0);
  });
});

describe("the derived / carried split", () => {
  it("accounts for every summary field exactly once", () => {
    const all = Object.keys(EMPTY_GANESH_SUMMARY).sort();
    const covered = [...DERIVED_SUMMARY_FIELDS, ...CARRIED_SUMMARY_FIELDS].sort();
    expect(covered).toEqual(all);
  });

  it("keeps the allocators out of the backend-owned set", () => {
    // The trigger writes DERIVED_SUMMARY_FIELDS and nothing else. An allocator
    // slipping into that list would reset donor-facing numbering on every
    // ledger write.
    for (const field of CARRIED_SUMMARY_FIELDS) {
      expect(DERIVED_SUMMARY_FIELDS).not.toContain(field);
    }
  });
});

describe("deriveMemberTotals", () => {
  it("attributes committee contributions, personal spend and repayment", () => {
    const totals = deriveMemberTotals({
      ...empty,
      contributions: rows({
        kind: "money",
        amount: 1000,
        status: "received",
        isCommitteeContribution: true,
        contributorMemberId: "m-1",
      }),
      expenses: rows({ personalAmount: 700, paidByMemberId: "m-1" }),
      reimbursements: rows({ amount: 200, memberId: "m-1" }),
    });
    expect(totals.get("m-1")).toEqual({
      contributionPaid: 1000,
      personalExpenses: 700,
      reimbursed: 200,
      pendingReimbursement: 500,
    });
  });

  it("floors pending reimbursement at zero rather than letting it drift negative", () => {
    // The client's increment() counters can and do go negative (GS-009). The
    // derivation is the definition that does not.
    const totals = deriveMemberTotals({
      ...empty,
      expenses: rows({ personalAmount: 100, paidByMemberId: "m-1" }),
      reimbursements: rows({ amount: 400, memberId: "m-1" }),
    });
    expect(totals.get("m-1")?.pendingReimbursement).toBe(0);
  });

  it("ignores a voided expense", () => {
    const totals = deriveMemberTotals({
      ...empty,
      expenses: rows({ personalAmount: 700, paidByMemberId: "m-1", voided: true }),
    });
    expect(totals.get("m-1")).toBeUndefined();
  });
});

describe("summaryAuditDelta", () => {
  it("records which totals moved, and only those", () => {
    // The stored summary claims 1,000 of chanda; the ledger holds 5,000. The
    // drift is visible in the trail, not just corrected silently (GS-053).
    const after = deriveFestivalSummary({
      ...empty,
      collections: rows({ amount: 5000, paymentMethod: "cash" }),
    });
    const delta = summaryAuditDelta({ chanda: 1000, collectionCount: 1 }, after);

    expect(delta.oldValue.chanda).toBe(1000);
    expect(delta.newValue.chanda).toBe(5000);
    expect(delta.reason).toContain("changed");
    // collectionCount already agreed, so it is not in the entry.
    expect(delta.movedKeys).not.toContain("collectionCount");
  });

  it("says so plainly when the recompute changed nothing", () => {
    // The common case. An entry listing every unchanged total would bury the
    // one that did move. The Cash bucket has to agree too, not just chanda: a
    // summary holding 5,000 of chanda with an empty Cash bucket is exactly the
    // unbackfilled state the God Fund location work addresses.
    const after = deriveFestivalSummary({
      ...empty,
      collections: rows({ amount: 5000, paymentMethod: "cash" }),
    });
    const delta = summaryAuditDelta({ chanda: 5000, collectionCount: 1, cash: 5000 }, after);

    expect(delta.movedKeys).toEqual([]);
    expect(delta.oldValue).toEqual({});
    expect(delta.newValue).toEqual({});
    expect(delta.reason).toContain("already agreed");
  });

  it("treats a missing summary as all zeroes rather than throwing", () => {
    const after = deriveFestivalSummary({
      ...empty,
      collections: rows({ amount: 250, paymentMethod: "upi" }),
    });
    const delta = summaryAuditDelta(null, after);
    expect(delta.oldValue.chanda).toBe(0);
    expect(delta.newValue.chanda).toBe(250);
  });
});
