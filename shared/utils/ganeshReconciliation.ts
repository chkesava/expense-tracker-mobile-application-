import type {
  CashReconciliation,
  CollectionSession,
  CollectionSessionStatus,
  ReconciliationStatus,
} from "@/shared/types/ganeshSessions";
import { money } from "@/shared/utils/ganeshMath";

/**
 * The rules of a collection session and its cash count (GS-076, GS-075).
 *
 * Pure, so the parts that decide whether money agrees can be tested without
 * Firestore. The service layer does the writing; every judgement lives here.
 */

/** Sum of the cash a session is accountable for. Non-cash never enters a count. */
export function sessionExpectedCash(
  collections: Array<{ amount: number; paymentMethod: string; voided?: boolean }>
): number {
  return money(
    collections
      .filter((row) => !row.voided && row.paymentMethod === "cash")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  );
}

/** UPI, bank and other. Reported at close, but not part of the physical count. */
export function sessionExpectedNonCash(
  collections: Array<{ amount: number; paymentMethod: string; voided?: boolean }>
): number {
  return money(
    collections
      .filter((row) => !row.voided && row.paymentMethod !== "cash")
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  );
}

export type SessionTotals = {
  expectedCash: number;
  expectedNonCash: number;
  totalCollected: number;
  collectionCount: number;
};

export function summarizeSession(
  collections: Array<{ amount: number; paymentMethod: string; voided?: boolean }>
): SessionTotals {
  const live = collections.filter((row) => !row.voided);
  const expectedCash = sessionExpectedCash(collections);
  const expectedNonCash = sessionExpectedNonCash(collections);
  return {
    expectedCash,
    expectedNonCash,
    totalCollected: money(expectedCash + expectedNonCash),
    collectionCount: live.length,
  };
}

/** counted - expected. Positive is a surplus, negative a shortfall. */
export function reconciliationDifference(countedCash: number, expectedCash: number): number {
  return money(Number(countedCash ?? 0) - Number(expectedCash ?? 0));
}

/** The outcome an approval will settle on, given the difference. */
export function reconciliationOutcomeFor(difference: number): ReconciliationStatus {
  return money(difference) === 0 ? "matched" : "mismatch";
}

/** The session status implied by a reconciliation outcome. */
export function sessionStatusForReconciliation(
  status: ReconciliationStatus
): CollectionSessionStatus {
  return status === "mismatch" ? "mismatch" : "reconciled";
}

export type Refusal = { ok: true } | { ok: false; error: string };

const OK: Refusal = { ok: true };

/** Only an open session takes new collections (GS-076 point 8). */
export function assertSessionAcceptsCollections(
  session: Pick<CollectionSession, "status"> | null | undefined
): Refusal {
  if (!session) return OK;
  if (session.status === "open") return OK;
  return {
    ok: false,
    error:
      session.status === "cancelled"
        ? "This collection session was cancelled. Start a new one to keep collecting."
        : "This collection session is closed. Start a new one to keep collecting.",
  };
}

export function canCloseSession(
  session: Pick<CollectionSession, "status">,
  declaredCash: number,
  expectedCash: number
): Refusal {
  if (session.status !== "open") {
    return { ok: false, error: "This session is already closed." };
  }
  // Point 7: a handover declaration is required when cash was collected. It may
  // legitimately differ from expected — that is what the count is for — but it
  // cannot be skipped.
  if (expectedCash > 0 && !(Number(declaredCash) >= 0)) {
    return {
      ok: false,
      error: "Enter the amount of cash you are handing over.",
    };
  }
  if (Number(declaredCash ?? 0) < 0) {
    return { ok: false, error: "The handover amount cannot be negative." };
  }
  return OK;
}

export function canCancelSession(
  session: Pick<CollectionSession, "status">,
  collectionCount: number
): Refusal {
  if (session.status !== "open") {
    return { ok: false, error: "Only an open session can be cancelled." };
  }
  // Cancelling is for a session opened by mistake. Once money is in it, the way
  // out is to close and reconcile — otherwise cancelling would strand recorded
  // collections outside any accountability trail.
  if (collectionCount > 0) {
    return {
      ok: false,
      error:
        "This session already has collections. Close it and hand the cash over instead of cancelling.",
    };
  }
  return OK;
}

/**
 * Who may **count** the cash (GS-075 step 3).
 *
 * Not the collector: the person who carried the money does not also produce the
 * figure it is checked against.
 */
export function canRecordCount(input: {
  actorId: string;
  collectorId: string;
  hasCountPermission: boolean;
}): Refusal {
  if (!input.hasCountPermission) {
    return {
      ok: false,
      error: "Your role cannot count cash. A treasurer or admin must do this.",
    };
  }
  if (input.actorId === input.collectorId) {
    return {
      ok: false,
      error:
        "You collected this cash, so someone else has to count it. Ask a treasurer or another admin.",
    };
  }
  return OK;
}

/**
 * Who may **approve** a count (GS-075 step 6, two-person flow).
 *
 * Three people are kept apart here: the collector who carried the cash, the
 * counter who produced the figure, and the approver who signs it off. The
 * counter approving their own count would collapse the two-person flow back
 * into one person, which is the whole thing this is designed to prevent.
 */
export function canApproveCount(input: {
  actorId: string;
  collectorId: string;
  countedBy: string;
  hasApprovalPermission: boolean;
}): Refusal {
  if (!input.hasApprovalPermission) {
    return {
      ok: false,
      error: "Your role cannot approve a cash count. A treasurer or admin must do this.",
    };
  }
  if (input.actorId === input.countedBy) {
    return {
      ok: false,
      error:
        "You counted this cash, so someone else has to approve it. Ask a treasurer or another admin.",
    };
  }
  if (input.actorId === input.collectorId) {
    return {
      ok: false,
      error: "You collected this cash, so you cannot approve the count of it.",
    };
  }
  return OK;
}

/**
 * May this actor close the session? (GS-076 point 6, with the admin override.)
 *
 * The collector closes their own. Anyone else needs the override authority and
 * has to say why, so the handover trail records that a second person ended
 * someone else's session rather than it simply appearing closed.
 */
export function canCloseOnBehalf(input: {
  actorId: string;
  collectorId: string;
  hasOverridePermission: boolean;
  reason?: string;
}): Refusal {
  if (input.actorId === input.collectorId) return OK;
  if (!input.hasOverridePermission) {
    return { ok: false, error: "This session belongs to another collector." };
  }
  if (!input.reason?.trim()) {
    return {
      ok: false,
      error: "Say why you are closing another collector's session.",
    };
  }
  return OK;
}

/** A mismatch has to be explained before it can be recorded (point 7). */
export function assertMismatchReason(difference: number, reason: string | undefined): Refusal {
  if (money(difference) === 0) return OK;
  if (!reason?.trim()) {
    return {
      ok: false,
      error: "The counted cash does not match. Record why before approving.",
    };
  }
  return OK;
}

/** Point 10: approved reconciliations are immutable except through an adjustment. */
export function assertReconciliationEditable(
  reconciliation: Pick<CashReconciliation, "locked"> | null | undefined
): Refusal {
  if (reconciliation?.locked) {
    return {
      ok: false,
      error:
        "This reconciliation is approved and cannot be changed. Record an adjustment instead.",
    };
  }
  return OK;
}

/**
 * Human copy for the three figures the UI must always show together
 * (GS-075: "Do not hide discrepancies").
 */
export function describeDifference(difference: number): string {
  const value = money(difference);
  if (value === 0) return "Cash matches the recorded collections.";
  return value > 0
    ? "There is more cash than the recorded collections account for."
    : "There is less cash than the recorded collections account for.";
}
