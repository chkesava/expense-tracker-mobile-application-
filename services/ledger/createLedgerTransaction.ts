import { buildDashboardSummaryOps } from "@/shared/utils/dashboardMutations";
/**
 * Shared Firestore create for expenses and incomes.
 * Used by ExpenseForm and statement import — one write shape, one collection path.
 */

import { collection, doc, serverTimestamp } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { buildAccountBalanceOps } from "@/shared/utils/balanceMutations";
import { fetchAccountTypes } from "./fetchAccountTypes";

export type CreateExpenseInput = {
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
  tags: string[];
  /** Optional Spending Space. Omitted from the document when unset. */
  spaceId?: string | null;
  /** HH:mm posting clock when known. */
  time?: string;
  /** SPENDLY-106 statement import provenance. */
  statementImportFingerprint?: string;
  creditCardBillId?: string;
  accountDocumentId?: string;
};

export type CreateIncomeInput = {
  amount: number;
  source: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
  /** HH:mm posting clock when known. */
  time?: string;
};

export type LedgerWriteResult = {
  /** Firestore document id — generated client-side, so it exists offline too. */
  id: string;
  outcome: WriteOutcome;
};

export type CreateLedgerOptions = {
  /** Deterministic id (statement import). Random id when omitted. */
  id?: string;
};

function requireUidAndDb(uid: string) {
  if (!uid.trim()) {
    throw new Error("Not authenticated");
  }
  const db = getFirestoreDb();
  if (!db) {
    throw new Error("Firestore is not available");
  }
  return db;
}

/**
 * Same payload ExpenseForm writes to users/{uid}/expenses.
 *
 * The id is generated locally rather than taken from `addDoc`'s resolved
 * reference, because `addDoc` only resolves on server ack — offline the caller
 * would wait forever for an id that already exists.
 */
export async function createExpense(
  uid: string,
  payload: CreateExpenseInput,
  options?: CreateLedgerOptions
): Promise<LedgerWriteResult> {
  const db = requireUidAndDb(uid);
  const ref = options?.id
    ? doc(db, "users", uid, "expenses", options.id)
    : doc(collection(db, "users", uid, "expenses"));
  const data = {
    amount: payload.amount,
    category: payload.category,
    subcategory: payload.subcategory,
    date: payload.date,
    month: payload.month,
    accountId: payload.accountId,
    note: payload.note,
    tags: payload.tags.length > 0 ? payload.tags : [],
    // Firestore rejects undefined, so an unassigned expense stays
    // byte-identical to what this function wrote before Spaces existed.
    ...(payload.spaceId ? { spaceId: payload.spaceId } : {}),
    ...(payload.time ? { time: payload.time } : {}),
    ...(payload.statementImportFingerprint
      ? { statementImportFingerprint: payload.statementImportFingerprint }
      : {}),
    ...(payload.creditCardBillId
      ? { creditCardBillId: payload.creditCardBillId }
      : {}),
    ...(payload.accountDocumentId
      ? { accountDocumentId: payload.accountDocumentId }
      : {}),
    createdAt: serverTimestamp(),
  };
  // SPENDLY-491: cache first, so the save never waits on a server round trip.
  // SPENDLY-436's "never seeded" handling lives in accountInfoFromSnap.
  const accountInfo = payload.accountId
    ? (await fetchAccountTypes(db, uid, [payload.accountId])).get(payload.accountId)
    : undefined;
  const isCreditCard = accountInfo?.isCreditCard ?? false;
  const oldBalance = accountInfo?.oldBalance ?? 0;
  const oldOutstanding = accountInfo?.oldOutstanding ?? 0;
  const needsInitialization = accountInfo?.needsInitialization ?? false;

  const expenseOps = [{ op: "set" as const, ref, data, merge: Boolean(options?.id) }];
  const balanceOps = payload.accountId ? buildAccountBalanceOps(uid, [
    { accountId: payload.accountId, amountDelta: -payload.amount, isCreditCard, oldBalance, oldOutstanding, needsInitialization }
  ]) : [];

  
  const dashboardOps = buildDashboardSummaryOps(uid, payload.month, {
    expenseDelta: payload.amount,
    transactionCountDelta: 1,
    categoryDeltas: { [payload.category]: payload.amount },
  });

  const outcome = await commitMutations(
    uid,
    [...expenseOps, ...balanceOps, ...dashboardOps],
    { label: "expense" }
  );
  return { id: ref.id, outcome };
}

/** Same payload ExpenseForm writes to users/{uid}/incomes. */
export async function createIncome(
  uid: string,
  payload: CreateIncomeInput,
  options?: CreateLedgerOptions
): Promise<LedgerWriteResult> {
  const db = requireUidAndDb(uid);
  const ref = options?.id
    ? doc(db, "users", uid, "incomes", options.id)
    : doc(collection(db, "users", uid, "incomes"));
  const data = {
    amount: payload.amount,
    source: payload.source,
    date: payload.date,
    month: payload.month,
    accountId: payload.accountId,
    note: payload.note,
    ...(payload.time ? { time: payload.time } : {}),
    createdAt: serverTimestamp(),
  };
  // SPENDLY-491: cache first, so the save never waits on a server round trip.
  // SPENDLY-436's "never seeded" handling lives in accountInfoFromSnap.
  const accountInfo = payload.accountId
    ? (await fetchAccountTypes(db, uid, [payload.accountId])).get(payload.accountId)
    : undefined;
  const isCreditCard = accountInfo?.isCreditCard ?? false;
  const oldBalance = accountInfo?.oldBalance ?? 0;
  const oldOutstanding = accountInfo?.oldOutstanding ?? 0;
  const needsInitialization = accountInfo?.needsInitialization ?? false;

  const incomeOps = [{ op: "set" as const, ref, data, merge: Boolean(options?.id) }];
  const balanceOps = payload.accountId ? buildAccountBalanceOps(uid, [
    { accountId: payload.accountId, amountDelta: payload.amount, isCreditCard, oldBalance, oldOutstanding, needsInitialization }
  ]) : [];

  
  const dashboardOps = buildDashboardSummaryOps(uid, payload.month, {
    incomeDelta: payload.amount,
    transactionCountDelta: 1,
  });

  const outcome = await commitMutations(
    uid,
    [...incomeOps, ...balanceOps, ...dashboardOps],
    { label: "income" }
  );
  return { id: ref.id, outcome };
}
