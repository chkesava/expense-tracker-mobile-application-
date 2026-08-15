/**
 * Shared Firestore create for expenses and incomes.
 * Used by ExpenseForm and SMS import — one write shape, one collection path.
 */

import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, type WriteOutcome } from "@/lib/firestoreWrite";

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
};

export type CreateIncomeInput = {
  amount: number;
  source: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
};

export type LedgerWriteResult = {
  /** Firestore document id — generated client-side, so it exists offline too. */
  id: string;
  outcome: WriteOutcome;
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
  payload: CreateExpenseInput
): Promise<LedgerWriteResult> {
  const db = requireUidAndDb(uid);
  const ref = doc(collection(db, "users", uid, "expenses"));
  const outcome = await commitWrite(
    () =>
      setDoc(ref, {
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
        createdAt: serverTimestamp(),
      }),
    { label: "expense" }
  );
  return { id: ref.id, outcome };
}

/** Same payload ExpenseForm writes to users/{uid}/incomes. */
export async function createIncome(
  uid: string,
  payload: CreateIncomeInput
): Promise<LedgerWriteResult> {
  const db = requireUidAndDb(uid);
  const ref = doc(collection(db, "users", uid, "incomes"));
  const outcome = await commitWrite(
    () =>
      setDoc(ref, {
        amount: payload.amount,
        source: payload.source,
        date: payload.date,
        month: payload.month,
        accountId: payload.accountId,
        note: payload.note,
        createdAt: serverTimestamp(),
      }),
    { label: "income" }
  );
  return { id: ref.id, outcome };
}
