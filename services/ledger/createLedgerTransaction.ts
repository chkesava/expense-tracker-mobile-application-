/**
 * Shared Firestore create for expenses and incomes.
 * Used by ExpenseForm and SMS import — one write shape, one collection path.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";

export type CreateExpenseInput = {
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
  tags: string[];
};

export type CreateIncomeInput = {
  amount: number;
  source: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
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

/** Same payload ExpenseForm writes to users/{uid}/expenses. */
export async function createExpense(
  uid: string,
  payload: CreateExpenseInput
): Promise<string> {
  const db = requireUidAndDb(uid);
  const ref = await addDoc(collection(db, "users", uid, "expenses"), {
    amount: payload.amount,
    category: payload.category,
    subcategory: payload.subcategory,
    date: payload.date,
    month: payload.month,
    accountId: payload.accountId,
    note: payload.note,
    tags: payload.tags.length > 0 ? payload.tags : [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Same payload ExpenseForm writes to users/{uid}/incomes. */
export async function createIncome(
  uid: string,
  payload: CreateIncomeInput
): Promise<string> {
  const db = requireUidAndDb(uid);
  const ref = await addDoc(collection(db, "users", uid, "incomes"), {
    amount: payload.amount,
    source: payload.source,
    date: payload.date,
    month: payload.month,
    accountId: payload.accountId,
    note: payload.note,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
