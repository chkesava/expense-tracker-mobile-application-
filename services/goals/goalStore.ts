import { collection, doc, increment, serverTimestamp } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { GoalIssue } from "@/shared/utils/goalModel";
import { goalWritePlanToOps, type GoalWriteResult } from "@/shared/utils/goalWrites";

/**
 * Persisting Save Goals (SPENDLY-608).
 *
 * Every goal write is one atomic outbox batch built by shared/utils/goalWrites:
 * the summary document, its append-only goalEvents and any goalNames lock land
 * together or not at all, and an offline save is journalled rather than frozen.
 * firestore.rules re-checks every invariant; nothing here is trusted.
 *
 * Nothing here touches an account, a ledger row or a transaction — a goal is
 * manual savings tracking.
 */

export class GoalInvalidError extends Error {
  constructor(readonly issues: GoalIssue[]) {
    super(`Invalid goal write: ${issues.join(", ")}`);
    this.name = "GoalInvalidError";
  }
}

function db() {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return database;
}

/** A fresh id for a goal that has not been saved yet. */
export function newGoalId(uid: string): string {
  return doc(collection(db(), "users", uid, "financialGoals")).id;
}

/**
 * A fresh event id. Mint it once per user submit and reuse it for a retry of
 * that same submit: it is the idempotency key.
 */
export function newGoalEventId(uid: string): string {
  return doc(collection(db(), "users", uid, "goalEvents")).id;
}

export async function commitGoalWrite(uid: string, result: GoalWriteResult, label: string): Promise<WriteOutcome> {
  if (!result.ok) throw new GoalInvalidError(result.issues);
  const ops = goalWritePlanToOps(uid, result.plan, { serverTimestamp, increment });
  return commitMutations(uid, ops, { label });
}
