/**
 * Credit-card bill payments that must move the bank ledger and the statement
 * stamp together (SPENDLY-30).
 *
 * Pay Bill used to `setDoc` the AccountPayment, await it, then RMW
 * `amountPaid` from React state. A late bill write left money paid on the bank
 * with the statement still OPEN; a double-tap lost one stamp. Delete only
 * removed the payment, so the out-of-band `amountPaid` floor kept the bill PAID.
 *
 * Writes go through one `writeBatch`. The stamp uses `increment` + `arrayUnion`
 * so two devices cannot clobber each other's `amountPaid`. Removing a payment
 * voids the row (same pattern as cashback) and reverses the stamp in that batch.
 */

import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, type WriteOutcome } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import { validateAccountMoneyMove } from "@/lib/finance/ledgerGuards";
import type { CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import {
  computeCreditCardBillStatus,
  computeRemainingAmount,
} from "@/shared/utils/creditCardBillStatus";
import { roundMoney } from "@/shared/utils/money";

export type CreditBillPaymentSource = "account" | "external";

export type CreditBillStampInput = {
  id: string;
  statementAmount: number;
  amountPaid: number;
  dueDate: string;
  status: CreditCardBillStatus;
  settleable: number;
  timezone: string;
};

export type RecordCreditBillPaymentInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  sourceType: CreditBillPaymentSource;
  paymentId?: string;
  appliedCycleStart?: string;
  appliedCycleEnd?: string;
  bill?: CreditBillStampInput;
};

export type RecordCreditBillPaymentResult = {
  paymentId: string;
  billStatus?: CreditCardBillStatus;
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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const result = { ...value };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

function derivedBillFields(input: {
  statementAmount: number;
  amountPaid: number;
  dueDate: string;
  status: CreditCardBillStatus;
  timezone: string;
}): { remainingAmount: number; status: CreditCardBillStatus } {
  const amountPaid = roundMoney(Math.max(0, input.amountPaid));
  const remainingAmount = computeRemainingAmount(input.statementAmount, amountPaid);
  const status =
    input.status === "CANCELLED"
      ? "CANCELLED"
      : computeCreditCardBillStatus({
          today: todayDateKey(input.timezone),
          dueDate: input.dueDate,
          amountPaid,
          statementAmount: input.statementAmount,
        });
  return { remainingAmount, status };
}

/**
 * Records a card payment and, when a statement can absorb it, stamps that
 * bill in the same commit.
 */
export async function recordCreditBillPayment(
  uid: string,
  input: RecordCreditBillPaymentInput
): Promise<RecordCreditBillPaymentResult> {
  const owner = requireUid(uid);
  if (input.sourceType === "account") {
    const validation = validateAccountMoneyMove({
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      date: input.date,
    });
    if (!validation.ok) throw new Error(validation.error);
  } else if (!input.toAccountId || !(input.amount > 0)) {
    throw new Error("Enter a valid amount");
  } else if (!isValidDateKey(input.date)) {
    throw new Error("Invalid payment date");
  }

  const db = requireDb();
  const paymentId = input.paymentId ?? newId();
  const settleable = input.bill ? Math.max(0, input.bill.settleable) : 0;
  const derived = input.bill
    ? derivedBillFields({
        statementAmount: input.bill.statementAmount,
        amountPaid: roundMoney(input.bill.amountPaid + settleable),
        dueDate: input.bill.dueDate,
        status: input.bill.status,
        timezone: input.bill.timezone,
      })
    : undefined;

  const outcome = await commitWrite(() => {
    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", owner, "accountPayments", paymentId),
      stripUndefined({
        fromAccountId:
          input.sourceType === "external" ? "external" : input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: roundMoney(Math.abs(Number(input.amount) || 0)),
        date: input.date,
        note: input.note?.trim() || "",
        sourceType: input.sourceType,
        creditCardBillId: input.bill?.id,
        appliedCycleStart: input.appliedCycleStart,
        appliedCycleEnd: input.appliedCycleEnd,
        createdAt: serverTimestamp(),
      })
    );
    if (input.bill && settleable > 0) {
      batch.update(doc(db, "users", owner, "creditCardBills", input.bill.id), {
        amountPaid: increment(settleable),
        paymentIds: arrayUnion(paymentId),
        paymentDate: input.date,
        remainingAmount: derived!.remainingAmount,
        status: derived!.status,
        updatedAt: serverTimestamp(),
      });
    }
    return batch.commit();
  }, { label: "credit card bill payment" });

  return { paymentId, billStatus: derived?.status, outcome };
}

/**
 * Voids a payment and reverses its bill stamp in one batch.
 *
 * A hard delete would leave history unexplained; `voidedAt` is how cashback
 * already reverses a ledger row. Bank balances ignore voided payments.
 */
export async function voidCreditBillPayment(
  uid: string,
  paymentId: string,
  options?: { timezone?: string; reason?: string }
): Promise<{ outcome: WriteOutcome; billStatus?: CreditCardBillStatus }> {
  const owner = requireUid(uid);
  const db = requireDb();
  const paymentRef = doc(db, "users", owner, "accountPayments", paymentId);
  const snapshot = await getDoc(paymentRef);
  if (!snapshot.exists()) throw new Error("Payment not found");

  const data = snapshot.data() as {
    amount?: number;
    creditCardBillId?: string;
    voidedAt?: string;
  };
  if (data.voidedAt) {
    return { outcome: "acked" };
  }

  const amount = roundMoney(Math.max(0, Number(data.amount) || 0));
  const billId = typeof data.creditCardBillId === "string" ? data.creditCardBillId : "";
  let derived: { remainingAmount: number; status: CreditCardBillStatus } | undefined;
  let nextPaid = 0;

  if (billId) {
    const billSnap = await getDoc(doc(db, "users", owner, "creditCardBills", billId));
    if (billSnap.exists()) {
      const bill = billSnap.data() as {
        statementAmount?: number;
        amountPaid?: number;
        dueDate?: string;
        status?: CreditCardBillStatus;
      };
      nextPaid = roundMoney(Math.max(0, (Number(bill.amountPaid) || 0) - amount));
      derived = derivedBillFields({
        statementAmount: Number(bill.statementAmount) || 0,
        amountPaid: nextPaid,
        dueDate: String(bill.dueDate || ""),
        status: bill.status ?? "UPCOMING",
        timezone: options?.timezone ?? "",
      });
    }
  }

  const outcome = await commitWrite(() => {
    const batch = writeBatch(db);
    batch.update(
      paymentRef,
      stripUndefined({
        voidedAt: new Date().toISOString(),
        voidReason: options?.reason?.trim() || "Payment removed",
        updatedAt: serverTimestamp(),
      })
    );
    if (billId && derived) {
      batch.update(doc(db, "users", owner, "creditCardBills", billId), {
        amountPaid: nextPaid,
        paymentIds: arrayRemove(paymentId),
        remainingAmount: derived.remainingAmount,
        status: derived.status,
        updatedAt: serverTimestamp(),
      });
    }
    return batch.commit();
  }, { label: "credit card bill payment reversal" });

  return { outcome, billStatus: derived?.status };
}
