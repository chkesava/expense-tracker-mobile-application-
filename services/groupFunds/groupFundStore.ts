import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  where,
} from "@/lib/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { fetchAccountTypes } from "@/services/ledger/fetchAccountTypes";
import { journalBalanceOps } from "@/services/ledger/journalBalanceOps";
import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import type { GroupFundIssue } from "@/shared/utils/groupFundModel";
import { groupFundWritePlanToOps, type GroupFundWriteResult } from "@/shared/utils/groupFundWrites";

/**
 * Persisting Group Funds (SPENDLY-684, epic SPENDLY-678).
 *
 * Every write is one atomic outbox batch: the fund's total increments, its
 * append-only events, the `accountEntries` rows (source `group_fund_*`) and
 * the account balance ops for those rows. They land together or not at all,
 * so an account is credited or debited exactly once, and never without the
 * fund knowing why. firestore.rules re-checks the invariants; nothing here is
 * trusted.
 *
 * Group money is never an expense, an income, a dashboard summary or a
 * transfer document — see docs/SPENDLY-678-group-funds.md.
 */

export class GroupFundInvalidError extends Error {
  constructor(readonly issues: GroupFundIssue[]) {
    super(`Invalid group fund write: ${issues.join(", ")}`);
    this.name = "GroupFundInvalidError";
  }
}

function db() {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return database;
}

/** A fresh id for a fund that has not been saved yet. */
export function newGroupFundId(uid: string): string {
  return doc(collection(db(), "users", uid, "groupFunds")).id;
}

/** A fresh id for a purpose or member (safe as a field-path key). */
export function newGroupFundKey(uid: string): string {
  return doc(collection(db(), "users", uid, "groupFunds")).id;
}

/**
 * A fresh event id. Mint it once per user submit and reuse it for a retry of
 * that same submit: it is the idempotency key for the event and its entries.
 */
export function newGroupFundEventId(uid: string): string {
  return doc(collection(db(), "users", uid, "groupFundEvents")).id;
}

/**
 * One fund as Firestore has it (cache first, then server). Writers build from
 * this rather than from a read-model copy (READ_MODEL_RULES R4.3a).
 */
export async function loadGroupFund(uid: string, fundId: string): Promise<GroupFund | null> {
  const ref = doc(db(), "users", uid, "groupFunds", fundId);
  let snap;
  try {
    snap = await getDocFromCache(ref);
  } catch {
    snap = await getDoc(ref);
  }
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<GroupFund, "id">), id: snap.id };
}

/**
 * The events a reversal of `target` must know about: earlier reversals of it
 * and, for a purpose transfer, its other half. Read fresh, so they are found
 * even when they sit on an unloaded history page. Bounded queries on single
 * fields (automatic indexes).
 */
export async function loadReversalContext(uid: string, target: GroupFundEvent): Promise<GroupFundEvent[]> {
  const events = collection(db(), "users", uid, "groupFundEvents");
  const queries = [query(events, where("reversalOf", "==", target.id), limit(5))];
  if (target.transferPairId) {
    queries.push(query(events, where("transferPairId", "==", target.transferPairId), limit(6)));
  }
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  const byId = new Map<string, GroupFundEvent>([[target.id, target]]);
  for (const snap of snaps) {
    logDirectRead(`users/${uid}/groupFundEvents`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
      feature: "groupFunds",
      queryShape: "reversal context",
    });
    for (const d of snap.docs) byId.set(d.id, { ...(d.data() as Omit<GroupFundEvent, "id">), id: d.id });
  }
  return [...byId.values()];
}

/**
 * SPENDLY-687: one member's events for one month (contributions and their
 * reversals carry `period`), to stop the same payment being recorded twice.
 * Equality filters only, so no composite index is needed; bounded.
 */
export async function loadMemberMonthEvents(
  uid: string,
  fundId: string,
  memberId: string,
  period: string
): Promise<GroupFundEvent[]> {
  const snap = await getDocs(
    query(
      collection(db(), "users", uid, "groupFundEvents"),
      where("fundId", "==", fundId),
      where("memberId", "==", memberId),
      where("period", "==", period),
      limit(50)
    )
  );
  logDirectRead(`users/${uid}/groupFundEvents`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
    feature: "groupFunds",
    queryShape: "member month",
  });
  return snap.docs.map((d) => ({ ...(d.data() as Omit<GroupFundEvent, "id">), id: d.id }));
}

export async function commitGroupFundWrite(
  uid: string,
  result: GroupFundWriteResult,
  label: string,
  /**
   * Called if the write fails after it was reported queued. Supplying it
   * replaces the outbox's default toast, so the caller must tell the user.
   */
  options: { onLateFailure?: (error: unknown) => void } = {}
): Promise<WriteOutcome> {
  if (!result.ok) throw new GroupFundInvalidError(result.issues);
  const { plan } = result;
  const ops = groupFundWritePlanToOps(uid, plan, { serverTimestamp, increment });
  if (plan.balanceLegs.length > 0) {
    const info = await fetchAccountTypes(
      db(),
      uid,
      plan.balanceLegs.map((leg) => leg.accountId)
    );
    // Group money sits in cash or a bank. A card or a deleted account would
    // either move the wrong figure or create a balance on a missing doc.
    for (const leg of plan.balanceLegs) {
      const account = info.get(leg.accountId);
      if (!account?.exists || account.isCreditCard) throw new GroupFundInvalidError(["account_unsupported"]);
    }
    ops.push(...journalBalanceOps(uid, plan.balanceLegs, info));
  }
  return commitMutations(uid, ops, { label, onLateFailure: options.onLateFailure });
}
