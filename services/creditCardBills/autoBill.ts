/**
 * Auto-created credit-card statements (SPENDLY-45).
 *
 * `generateAutoBills` used to `createBill` with a random id after every
 * bills/expenses/payments snapshot. Two devices (or a stale cache) both saw
 * "no statement for this date" and wrote two docs. Reminders and Pay Bill
 * then diverged.
 *
 * Auto bills use `creditCardBills/${accountId}_${statementDate}` and
 * `setDoc(..., { merge: true })`. A replay hits the same path. Settlement
 * fields (`status`, `amountPaid`, `paymentIds`, `remainingAmount`) are not
 * written as absolute values — `amountPaid` uses `increment(0)` so a paid
 * statement is not reset to 0. Manual create keeps a random id.
 *
 * `writeBatch`/`setDoc` + `commitWrite`, not `runTransaction`: a transaction
 * needs the server, and this path must still queue offline.
 */

import { doc, increment, serverTimestamp } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { CreditCardBillReminderFrequency } from "@/shared/types/creditCardBill";
import { autoCreditCardBillDocId } from "@/shared/utils/autoCreditCardBills";
import { isValidDateKey } from "@/shared/utils/dates";

export type CreateAutoCreditCardBillInput = {
  accountId: string;
  statementAmount: number;
  minimumDueAmount: number;
  statementDate: string;
  dueDate: string;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  note?: string | null;
  currency: string;
  reminderEnabled: boolean;
  reminderFrequency: CreditCardBillReminderFrequency;
};

export type CreateAutoCreditCardBillResult = {
  id: string;
  outcome: WriteOutcome;
};

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");
  return db;
}

function requireUid(uid: string) {
  if (!uid.trim()) throw new Error("Not authenticated");
  return uid;
}

export async function createAutoCreditCardBill(
  uid: string,
  input: CreateAutoCreditCardBillInput
): Promise<CreateAutoCreditCardBillResult> {
  const owner = requireUid(uid);
  const db = requireDb();
  const accountId = input.accountId.trim();
  if (!accountId) throw new Error("Credit card account is required");
  if (!isValidDateKey(input.statementDate)) {
    throw new Error("Statement date must be YYYY-MM-DD");
  }
  if (!isValidDateKey(input.dueDate)) {
    throw new Error("Due date must be YYYY-MM-DD");
  }

  const id = autoCreditCardBillDocId(accountId, input.statementDate);
  const ref = doc(db, "users", owner, "creditCardBills", id);
  const outcome = await commitMutations(
    owner,
    [
      {
        op: "set",
        ref,
        merge: true,
        data: {
          accountId,
          billingPeriodStart: input.billingPeriodStart ?? null,
          billingPeriodEnd: input.billingPeriodEnd ?? null,
          statementDate: input.statementDate,
          dueDate: input.dueDate,
          statementAmount: input.statementAmount,
          minimumDueAmount: input.minimumDueAmount,
          currency: input.currency,
          note: input.note ?? null,
          reminderEnabled: input.reminderEnabled,
          reminderFrequency: input.reminderFrequency,
          amountPaid: increment(0),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    ],
    { label: "credit card bill" }
  );
  return { id, outcome };
}
