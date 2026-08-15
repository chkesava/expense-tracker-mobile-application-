/**
 * SMS commit uses the same createExpense / createIncome helpers as ExpenseForm.
 */

import { createExpense, createIncome } from "@/services/ledger/createLedgerTransaction";
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
  if (write.collection === "expenses") {
    const { id } = await createExpense(uid, write.payload);
    return { collection: "expenses", id };
  }
  const { id } = await createIncome(uid, write.payload);
  return { collection: "incomes", id };
}
