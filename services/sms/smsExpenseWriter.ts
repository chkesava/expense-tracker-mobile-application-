/**
 * SMS commit uses the same createExpense / createIncome helpers as ExpenseForm.
 */

import { createExpense, createIncome } from "@/services/ledger/createLedgerTransaction";
import type { SmsWritePayload } from "@/shared/types/smsTransaction";
import { smsLedgerDocId } from "./smsDedupe";

export type SmsCommitResult = {
  collection: "expenses" | "incomes";
  id: string;
};

export type SmsExpenseWriter = (
  uid: string,
  write: SmsWritePayload,
  meta?: { fingerprint?: string }
) => Promise<SmsCommitResult>;

export async function commitSmsWritePayload(
  uid: string,
  write: SmsWritePayload,
  meta?: { fingerprint?: string }
): Promise<SmsCommitResult> {
  if (!uid.trim() || uid.endsWith("_duress")) {
    throw new Error("SMS commit blocked");
  }
  const fingerprint =
    meta?.fingerprint ||
    ("smsFingerprint" in write.payload ? write.payload.smsFingerprint : undefined);
  const id = fingerprint ? smsLedgerDocId(fingerprint) : undefined;
  if (write.collection === "expenses") {
    const { id: docId } = await createExpense(uid, write.payload, { id });
    return { collection: "expenses", id: docId };
  }
  const { id: docId } = await createIncome(uid, write.payload, { id });
  return { collection: "incomes", id: docId };
}
