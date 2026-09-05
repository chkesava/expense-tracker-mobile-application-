import type {
  CashReconciliation,
  CollectionSession,
  CollectionSessionStatus,
  ReconciliationStatus,
} from "@/shared/types/ganeshSessions";

/**
 * How sessions and cash counts are labelled in the UI (GS-076, GS-075).
 *
 * Pure, so the wording is testable — which matters more than usual here,
 * because the whole instruction on this feature was "do not hide
 * discrepancies", and the wording is where that is either honoured or lost.
 */

export function sessionStatusLabel(status: CollectionSessionStatus): string {
  switch (status) {
    case "open":
      return "Collecting";
    case "closed":
      // Deliberately not "Done". The cash has not been counted yet, and saying
      // so is the point of having this state at all.
      return "Awaiting count";
    case "reconciled":
      return "Cash counted";
    case "mismatch":
      return "Cash did not match";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Maps onto the shared badge palette; warning tones for anything unfinished. */
export function sessionStatusKind(
  status: CollectionSessionStatus
): "received" | "pending" | "overdue" | "neutral" | "promised" {
  switch (status) {
    case "open":
      return "promised";
    case "closed":
      return "pending";
    case "reconciled":
      return "received";
    case "mismatch":
      return "overdue";
    default:
      return "neutral";
  }
}

export function reconciliationStatusLabel(status: ReconciliationStatus): string {
  switch (status) {
    case "counted":
      return "Awaiting approval";
    case "matched":
      return "Matched";
    case "mismatch":
      return "Did not match";
    case "resolved":
      // Not "Matched". The difference was explained, it did not go away, and
      // the report has to keep saying so.
      return "Difference resolved";
    default:
      return status;
  }
}

export function reconciliationStatusKind(
  status: ReconciliationStatus
): "received" | "pending" | "overdue" | "neutral" {
  switch (status) {
    case "counted":
      return "pending";
    case "matched":
      return "received";
    case "mismatch":
      return "overdue";
    case "resolved":
      return "neutral";
    default:
      return "neutral";
  }
}

/** What this session is waiting for, phrased as the next action. */
export function sessionNextStep(
  session: Pick<CollectionSession, "status" | "collectorName">,
  reconciliation?: Pick<CashReconciliation, "status" | "countedByName"> | null
): string | null {
  if (session.status === "open") return "Close the session to hand the cash over.";
  if (session.status === "cancelled") return null;
  if (!reconciliation) {
    return `A treasurer needs to count ${session.collectorName}'s cash.`;
  }
  if (reconciliation.status === "counted") {
    return `${reconciliation.countedByName} counted it. Someone else has to approve.`;
  }
  if (reconciliation.status === "mismatch") {
    return "The difference needs resolving with an adjustment.";
  }
  return null;
}

/** True when this session still needs someone to do something. */
export function sessionNeedsAttention(
  session: Pick<CollectionSession, "status">,
  reconciliation?: Pick<CashReconciliation, "status"> | null
): boolean {
  if (session.status === "closed") return true;
  if (session.status === "mismatch") return reconciliation?.status !== "resolved";
  return false;
}
