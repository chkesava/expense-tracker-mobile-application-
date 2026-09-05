import { describe, expect, it } from "vitest";

import {
  assertMismatchReason,
  assertReconciliationEditable,
  assertSessionAcceptsCollections,
  canApproveCount,
  canCloseOnBehalf,
  canRecordCount,
  canCancelSession,
  canCloseSession,
  describeDifference,
  reconciliationDifference,
  reconciliationOutcomeFor,
  sessionExpectedCash,
  sessionExpectedNonCash,
  sessionStatusForReconciliation,
  summarizeSession,
} from "@/shared/utils/ganeshReconciliation";

/**
 * The rules of a session and its cash count (GS-076, GS-075).
 *
 * These are the judgements the money depends on, so they are tested directly
 * rather than through Firestore.
 */

const ROWS = [
  { amount: 500, paymentMethod: "cash" },
  { amount: 300, paymentMethod: "cash" },
  { amount: 200, paymentMethod: "upi" },
  { amount: 100, paymentMethod: "cash", voided: true },
];

describe("session totals", () => {
  it("counts only live cash toward the expected cash", () => {
    // A voided collection is not cash anyone is holding, so counting it would
    // manufacture a shortfall at every reconciliation.
    expect(sessionExpectedCash(ROWS)).toBe(800);
  });

  it("keeps non-cash out of the physical count", () => {
    // UPI cannot be in the bag. Including it would make every session with a
    // UPI donation look short by exactly that amount.
    expect(sessionExpectedNonCash(ROWS)).toBe(200);
  });

  it("summarizes a session for its close", () => {
    expect(summarizeSession(ROWS)).toEqual({
      expectedCash: 800,
      expectedNonCash: 200,
      totalCollected: 1000,
      collectionCount: 3,
    });
  });

  it("handles a session with nothing in it", () => {
    expect(summarizeSession([])).toEqual({
      expectedCash: 0,
      expectedNonCash: 0,
      totalCollected: 0,
      collectionCount: 0,
    });
  });

  it("rounds once, so paise cannot accumulate into a false difference", () => {
    const totals = summarizeSession([
      { amount: 33.33, paymentMethod: "cash" },
      { amount: 33.33, paymentMethod: "cash" },
      { amount: 33.34, paymentMethod: "cash" },
    ]);
    expect(totals.expectedCash).toBe(100);
  });
});

describe("the difference", () => {
  it("is counted minus expected, so a surplus is positive", () => {
    expect(reconciliationDifference(5200, 5000)).toBe(200);
    expect(reconciliationDifference(4800, 5000)).toBe(-200);
    expect(reconciliationDifference(5000, 5000)).toBe(0);
  });

  it("treats an exact match as matched and anything else as a mismatch", () => {
    expect(reconciliationOutcomeFor(0)).toBe("matched");
    expect(reconciliationOutcomeFor(-1)).toBe("mismatch");
    expect(reconciliationOutcomeFor(0.5)).toBe("mismatch");
  });

  it("marks the session so a discrepancy stays visible on it", () => {
    expect(sessionStatusForReconciliation("matched")).toBe("reconciled");
    expect(sessionStatusForReconciliation("mismatch")).toBe("mismatch");
    expect(sessionStatusForReconciliation("resolved")).toBe("reconciled");
  });

  it("says which way it went, without hiding it", () => {
    expect(describeDifference(0)).toContain("matches");
    expect(describeDifference(200)).toContain("more cash");
    expect(describeDifference(-200)).toContain("less cash");
  });
});

describe("closed sessions stop accepting collections (GS-076 point 8)", () => {
  it("allows an open session", () => {
    expect(assertSessionAcceptsCollections({ status: "open" }).ok).toBe(true);
  });

  it("refuses every closed state", () => {
    for (const status of ["closed", "reconciled", "mismatch", "cancelled"] as const) {
      expect(assertSessionAcceptsCollections({ status }).ok).toBe(false);
    }
  });

  it("allows a collection with no session at all", () => {
    // Sessions are new; rows predating them, and collections recorded outside
    // one, stay valid.
    expect(assertSessionAcceptsCollections(null).ok).toBe(true);
  });
});

describe("closing a session", () => {
  it("requires a handover declaration when cash was collected", () => {
    const result = canCloseSession({ status: "open" }, Number.NaN, 800);
    expect(result.ok).toBe(false);
  });

  it("accepts a declaration that differs from expected", () => {
    // The declaration is what the collector says they hold. Disagreeing with
    // the ledger is exactly what the count is for, so it must not be blocked
    // here — that would push collectors into declaring a number they know is
    // wrong.
    expect(canCloseSession({ status: "open" }, 750, 800).ok).toBe(true);
  });

  it("refuses a negative declaration", () => {
    expect(canCloseSession({ status: "open" }, -1, 800).ok).toBe(false);
  });

  it("allows closing a cash-free session with nothing declared", () => {
    expect(canCloseSession({ status: "open" }, 0, 0).ok).toBe(true);
  });

  it("refuses closing twice", () => {
    expect(canCloseSession({ status: "closed" }, 800, 800).ok).toBe(false);
  });
});

describe("cancelling a session", () => {
  it("allows cancelling an empty one", () => {
    expect(canCancelSession({ status: "open" }, 0).ok).toBe(true);
  });

  it("refuses cancelling one that already holds money", () => {
    // Otherwise recorded collections would be stranded outside any handover.
    const result = canCancelSession({ status: "open" }, 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Close it");
  });

  it("refuses cancelling one that is already closed", () => {
    expect(canCancelSession({ status: "closed" }, 0).ok).toBe(false);
  });
});

describe("who may count the cash (GS-075 step 3)", () => {
  it("refuses someone without count authority", () => {
    expect(
      canRecordCount({ actorId: "u-1", collectorId: "u-2", hasCountPermission: false }).ok
    ).toBe(false);
  });

  it("refuses the collector counting their own cash", () => {
    const result = canRecordCount({
      actorId: "u-1",
      collectorId: "u-1",
      hasCountPermission: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("someone else");
  });

  it("allows an authorized second person", () => {
    expect(
      canRecordCount({
        actorId: "u-treasurer",
        collectorId: "u-collector",
        hasCountPermission: true,
      }).ok
    ).toBe(true);
  });
});

describe("who may approve a count (GS-075 step 6, two-person flow)", () => {
  const BASE = {
    actorId: "u-approver",
    collectorId: "u-collector",
    countedBy: "u-counter",
    hasApprovalPermission: true,
  };

  it("allows a genuine third person", () => {
    expect(canApproveCount(BASE).ok).toBe(true);
  });

  it("refuses the counter approving their own count", () => {
    // This is the whole point of two people. Without it the flow collapses
    // back into one.
    const result = canApproveCount({ ...BASE, actorId: "u-counter" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("You counted this cash");
  });

  it("refuses the collector approving the count of their own cash", () => {
    const result = canApproveCount({ ...BASE, actorId: "u-collector" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("You collected this cash");
  });

  it("refuses anyone without approval authority", () => {
    expect(canApproveCount({ ...BASE, hasApprovalPermission: false }).ok).toBe(false);
  });
});

describe("closing another collector's session (GS-076 override)", () => {
  it("needs no override for your own session", () => {
    expect(
      canCloseOnBehalf({
        actorId: "u-1",
        collectorId: "u-1",
        hasOverridePermission: false,
      }).ok
    ).toBe(true);
  });

  it("refuses someone else's session without the authority", () => {
    expect(
      canCloseOnBehalf({
        actorId: "u-2",
        collectorId: "u-1",
        hasOverridePermission: false,
        reason: "went home",
      }).ok
    ).toBe(false);
  });

  it("requires a reason when closing on someone's behalf", () => {
    // The override has to be auditable, not silent.
    const result = canCloseOnBehalf({
      actorId: "u-2",
      collectorId: "u-1",
      hasOverridePermission: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("why");
  });

  it("allows an authorized override with a reason", () => {
    expect(
      canCloseOnBehalf({
        actorId: "u-2",
        collectorId: "u-1",
        hasOverridePermission: true,
        reason: "Ravi went home without closing; cash handed to me at the pandal",
      }).ok
    ).toBe(true);
  });
});

describe("a discrepancy has to be explained", () => {
  it("requires a reason when the cash does not match", () => {
    expect(assertMismatchReason(-500, undefined).ok).toBe(false);
    expect(assertMismatchReason(-500, "   ").ok).toBe(false);
    expect(assertMismatchReason(-500, "Two notes torn, replaced next day").ok).toBe(true);
  });

  it("asks for nothing when it matches", () => {
    expect(assertMismatchReason(0, undefined).ok).toBe(true);
  });
});

describe("an approved reconciliation is immutable (point 10)", () => {
  it("refuses edits once locked", () => {
    const result = assertReconciliationEditable({ locked: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("adjustment");
  });

  it("allows a first count", () => {
    expect(assertReconciliationEditable(null).ok).toBe(true);
    expect(assertReconciliationEditable({ locked: false }).ok).toBe(true);
  });
});
