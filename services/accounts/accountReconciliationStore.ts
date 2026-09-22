import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { AccountReconciliation } from "@/shared/types/expense";
import { isValidDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";

/**
 * Persisting the record that an account was checked (SPENDLY-87).
 *
 * A one-shot read rather than a live subscription in `FinanceDataProvider`:
 * reconciliations are an audit trail nobody looks at until they open the
 * reconcile sheet, so keeping a listener open on every screen for the life of
 * the session would cost every user for a page most of them never visit.
 *
 * Queried by `accountId` alone and sorted on the client. An `orderBy` beside
 * the `where` would need a composite index, and the index file in this repo is
 * known to be a subset of what is deployed — so a query that needs no index is
 * a query that cannot break on release day.
 */

const COLLECTION = "accountReconciliations";

export interface SaveReconciliationInput {
  accountId: string;
  fromDate: string;
  toDate: string;
  statementClosingBalance: number;
  ledgerClosingBalance: number;
  variance: number;
  status: "balanced" | "variance";
  matchedCount: number;
  missingCount: number;
  extraCount: number;
  note?: string;
  /** The explicit account entry recorded to close the variance, if any. */
  adjustmentEntryId?: string;
}

export function isSaveReconciliationInputValid(
  input: SaveReconciliationInput
): boolean {
  return (
    Boolean(input.accountId) &&
    isValidDateKey(input.fromDate) &&
    isValidDateKey(input.toDate) &&
    input.fromDate <= input.toDate &&
    Number.isFinite(input.statementClosingBalance) &&
    Number.isFinite(input.ledgerClosingBalance) &&
    Number.isFinite(input.variance)
  );
}

/**
 * Writes the reconciliation record. Writes nothing else.
 *
 * In particular it does not touch a balance, an expense or an entry: the
 * adjustment that closes a variance is recorded separately, by the user, as an
 * ordinary account entry, and only its id is referenced here.
 */
export async function saveAccountReconciliation(
  uid: string,
  input: SaveReconciliationInput
): Promise<string | null> {
  const database = getFirestoreDb();
  if (!database || !uid || !isSaveReconciliationInputValid(input)) return null;

  const ref = doc(collection(database, "users", uid, COLLECTION));
  await commitMutations(
    uid,
    [
      {
        op: "set",
        ref,
        data: {
          accountId: input.accountId,
          fromDate: input.fromDate,
          toDate: input.toDate,
          statementClosingBalance: roundMoney(input.statementClosingBalance),
          ledgerClosingBalance: roundMoney(input.ledgerClosingBalance),
          variance: roundMoney(input.variance),
          status: input.status,
          matchedCount: input.matchedCount,
          missingCount: input.missingCount,
          extraCount: input.extraCount,
          note: input.note?.trim() || "",
          ...(input.adjustmentEntryId
            ? { adjustmentEntryId: input.adjustmentEntryId }
            : {}),
          createdAt: serverTimestamp(),
        },
      },
    ],
    { label: "account reconciliation" }
  );
  return ref.id;
}

/** Past reconciliations for one account, newest period first. */
export async function listAccountReconciliations(
  uid: string,
  accountId: string
): Promise<AccountReconciliation[]> {
  const database = getFirestoreDb();
  if (!database || !uid || !accountId) return [];

  const snapshot = await getDocs(
    query(
      collection(database, "users", uid, COLLECTION),
      where("accountId", "==", accountId)
    )
  );

  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }) as AccountReconciliation)
    .sort((a, b) => (b.toDate ?? "").localeCompare(a.toDate ?? ""));
}
