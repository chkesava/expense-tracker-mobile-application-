import { collection, doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { MoneyDecision } from "@/shared/types/decision";
import {
  buildDecisionWrite,
  deletionEvent,
  type DecisionIssue,
} from "@/shared/utils/decisionModel";

/**
 * Persisting Money Decisions (SPENDLY-363).
 *
 * Every write is one atomic batch through the outbox: the decision document
 * and its append-only `decisionEvents` row together, so the audit trail can
 * never miss a change and an offline save is queued rather than frozen.
 *
 * Nothing here touches a ledger collection — a decision is reasoning, and the
 * records it links to stay owned by their own modules.
 */

export class DecisionInvalidError extends Error {
  constructor(readonly issues: DecisionIssue[]) {
    super(`Invalid decision: ${issues.join(", ")}`);
    this.name = "DecisionInvalidError";
  }
}

function db() {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return database;
}

/** A fresh document id for a decision that has not been saved yet. */
export function newDecisionId(uid: string): string {
  return doc(collection(db(), "users", uid, "decisions")).id;
}

export async function saveDecision(
  uid: string,
  previous: MoneyDecision | null,
  next: MoneyDecision
): Promise<{ outcome: WriteOutcome; saved: MoneyDecision }> {
  const database = db();
  const built = buildDecisionWrite(previous, next, Date.now());
  if (!built.ok) throw new DecisionInvalidError(built.issues);
  const outcome = await commitMutations(
    uid,
    [
      { op: "set", ref: doc(database, "users", uid, "decisions", next.id), data: built.data },
      { op: "set", ref: doc(collection(database, "users", uid, "decisionEvents")), data: built.event },
    ],
    { label: "decision" }
  );
  return { outcome, saved: { ...built.data, id: next.id } };
}

export async function deleteDecision(uid: string, decision: MoneyDecision): Promise<WriteOutcome> {
  const database = db();
  return commitMutations(
    uid,
    [
      { op: "delete", ref: doc(database, "users", uid, "decisions", decision.id) },
      { op: "set", ref: doc(collection(database, "users", uid, "decisionEvents")), data: deletionEvent(decision, Date.now()) },
    ],
    { label: "decision" }
  );
}
