import type { MutationOp } from "@/shared/types/mutations";
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

import { doc, serverTimestamp } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import {
  docAlreadyWritten,
  fetchAccountTypes,
} from "@/services/ledger/fetchAccountTypes";
import { buildAccountBalanceOps } from "@/shared/utils/balanceMutations";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import {
  ledgerRowAccountDeltas,
  type LedgerRow,
} from "@/shared/utils/ledgerAccountDeltas";
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
  const ops: MutationOp[] = [];
  const chargeRef =
    action.kind === "transfer"
      ? doc(db, "users", owner, "accountTransfers", action.docId)
      : doc(db, "users", owner, "expenses", action.docId);

  // SPENDLY-523: due-posts never moved the materialized account balance, so
  // every auto-posted charge left `currentBalance` too high (or both transfer
  // legs stale). The id is deterministic, so a second device or a re-run that
  // lands on the same doc must not apply the delta again.
  const balanceOps = (await docAlreadyWritten(chargeRef))
    ? []
    : await chargeBalanceOps(db, owner, action);

  if (action.kind === "transfer") {
    ops.push({
      op: "set",
      ref: chargeRef,
      merge: true,
      data: omitUndefined({
        ...action.transfer,
        createdAt: serverTimestamp(),
      }),
    });
  } else {
    ops.push({
      op: "set",
      ref: chargeRef,
      merge: true,
      data: omitUndefined({
        ...action.expense,
        createdAt: serverTimestamp(),
      }),
    });
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
  ops.push({
    op: "update",
    ref: doc(db, "users", owner, "subscriptions", action.subscriptionId),
    data: subUpdates,
  });

  ops.push(...balanceOps);

  const outcome = await commitMutations(owner, ops, {
    label: "subscription charge",
  });
  return { status: "posted", docId: action.docId, outcome };
}

/** Balance ops for the posted charge: the expense's account, or both transfer legs. */
async function chargeBalanceOps(
  db: ReturnType<typeof requireDb>,
  owner: string,
  action: DuePostAction
): Promise<MutationOp[]> {
  const row: LedgerRow =
    action.kind === "transfer"
      ? { kind: "accountTransfer", row: { id: action.docId, ...action.transfer } }
      : { kind: "expense", row: { id: action.docId, ...action.expense } };
  const deltas = ledgerRowAccountDeltas(row);
  if (deltas.length === 0) return [];
  const info = await fetchAccountTypes(
    db,
    owner,
    deltas.map((d) => d.accountId)
  );
  return buildAccountBalanceOps(
    owner,
    deltas.map((d) => {
      const account = info.get(d.accountId);
      return {
        accountId: d.accountId,
        amountDelta: d.amountDelta,
        isCreditCard: account?.isCreditCard ?? false,
        oldBalance: account?.oldBalance,
        oldOutstanding: account?.oldOutstanding,
        needsInitialization: account?.needsInitialization,
      };
    })
  );
}
