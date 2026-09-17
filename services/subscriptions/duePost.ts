/**
 * Idle auto-post for due subscriptions / EMIs / transfers (SPENDLY-40).
 *
 * Two devices used to mint a random expense id after both saw
 * `lastProcessed !== monthKey`. Replays now `setDoc` the same
 * `{subscriptionId}_{monthKey}` (or `_{targetDate}` for every-N-days) path.
 * A missing `accountId` used to throw `undefined` and abort the rest of the
 * run; that charge is skipped instead so later subscriptions still post.
 *
 * `writeBatch` + `commitWrite`, not `runTransaction`: this must queue offline.
 */

import { doc, serverTimestamp, writeBatch } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, type WriteOutcome } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  duePostNeedsAccount,
  type DuePostAction,
} from "@/shared/utils/subscriptionProcessor";

export type PostDueSubscriptionResult =
  | { status: "posted"; docId: string; outcome: WriteOutcome }
  | { status: "skipped_no_account"; docId: string };

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");
  return db;
}

function requireUid(uid: string) {
  if (!uid.trim()) throw new Error("Not authenticated");
  return uid;
}

export async function postDueSubscriptionCharge(
  uid: string,
  action: DuePostAction
): Promise<PostDueSubscriptionResult> {
  const owner = requireUid(uid);
  if (!action.subscriptionId || !action.docId) {
    throw new Error("Subscription charge is missing an id");
  }
  if (duePostNeedsAccount(action)) {
    return { status: "skipped_no_account", docId: action.docId };
  }

  const db = requireDb();
  const batch = writeBatch(db);

  if (action.kind === "transfer") {
    batch.set(
      doc(db, "users", owner, "accountTransfers", action.docId),
      omitUndefined({
        ...action.transfer,
        createdAt: serverTimestamp(),
      }),
      { merge: true }
    );
  } else {
    batch.set(
      doc(db, "users", owner, "expenses", action.docId),
      omitUndefined({
        ...action.expense,
        createdAt: serverTimestamp(),
      }),
      { merge: true }
    );
  }

  const subUpdates: Record<string, unknown> = {
    lastProcessed: action.monthKey,
  };
  if (action.lastProcessedDate) {
    subUpdates.lastProcessedDate = action.lastProcessedDate;
  }
  if (action.markCompleted) {
    subUpdates.isCompleted = true;
    subUpdates.isActive = false;
  }
  batch.update(
    doc(db, "users", owner, "subscriptions", action.subscriptionId),
    subUpdates
  );

  const outcome = await commitWrite(() => batch.commit(), {
    label: "subscription charge",
  });
  return { status: "posted", docId: action.docId, outcome };
}
