/**
 * Thin Firestore writer for SMS review Add.
 * Mirrors ExpenseForm create payload; does not change ExpenseForm.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import type { SmsWritePayload } from "@/shared/types/smsTransaction";

export type SmsCommitResult = {
  collection: "expenses" | "incomes";
  id: string;
};

export type SmsExpenseWriter = (
  uid: string,
  write: SmsWritePayload
) => Promise<SmsCommitResult>;

export async function commitSmsWritePayload(
  uid: string,
  write: SmsWritePayload
): Promise<SmsCommitResult> {
  if (!uid.trim() || uid.endsWith("_duress")) {
    throw new Error("SMS commit blocked");
  }
  const db = getFirestoreDb();
  if (!db) {
    throw new Error("Firestore is not available");
  }
  const ref = await addDoc(collection(db, "users", uid, write.collection), {
    ...write.payload,
    createdAt: serverTimestamp(),
  });
  return { collection: write.collection, id: ref.id };
}
