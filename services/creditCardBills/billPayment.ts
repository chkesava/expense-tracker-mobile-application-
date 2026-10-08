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
 *
 * SPENDLY-385: a recorded payment can be corrected in place — wrong bank,
 * amount, date or note. Balances are derived from the payment row, so moving
 * `fromAccountId` moves the bank effect by itself; the only stored figure that
 * can double count is the bill's `amountPaid`, which an edit moves by the
 * difference in what this payment applied to it, never by the full amount.
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import { commitMutations, type MutationOp } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { newId } from "@/lib/id";
import { validateAccountMoneyMove } from "@/lib/finance/ledgerGuards";
import type { CreditCardBillStatus } from "@/shared/types/creditCardBill";
import { CASHBACK_SOURCE_ID } from "@/shared/types/expense";
import type { LedgerEventSnapshot } from "@/shared/types/ledgerEvent";
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

type StoredPayment = {
  fromAccountId?: string;
  toAccountId?: string;
  amount?: number;
  date?: string;
  note?: string;
  sourceType?: string;
  creditCardBillId?: string;
  billAppliedAmount?: number;
  voidedAt?: string;
  updatedAt?: unknown;
};

type StoredBill = {
  statementAmount?: number;
  amountPaid?: number;
  dueDate?: string;
  statementDate?: string;
  status?: CreditCardBillStatus;
  paymentIds?: string[];
  paymentDate?: string;
};

function moneyOf(value: unknown): number {
  return roundMoney(Math.max(0, Number(value) || 0));
}

/**
 * How much of a payment sits in its bill's `amountPaid`.
 *
 * New payments record it (`billAppliedAmount`). Older ones don't, so the best
 * estimate is the payment amount capped by what the bill holds — and nothing
 * at all if the bill never linked the payment. Either way it is capped at the
 * stored total: removing more than the bill holds would drive `amountPaid`
 * negative, which the rules reject and which would take another payment's
 * share with it.
 */
export function appliedAmountOf(
  paymentId: string,
  payment: Pick<StoredPayment, "amount" | "billAppliedAmount">,
  bill: Pick<StoredBill, "amountPaid" | "paymentIds">
): number {
  const storedPaid = moneyOf(bill.amountPaid);
  if (typeof payment.billAppliedAmount === "number") {
    return Math.min(moneyOf(payment.billAppliedAmount), storedPaid);
  }
  const linked = Array.isArray(bill.paymentIds)
    ? bill.paymentIds.includes(paymentId)
    : false;
  if (!linked) return 0;
  return Math.min(moneyOf(payment.amount), storedPaid);
}

/** Comparable millis for a stored timestamp, or null when unset/pending. */
function timestampMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object") {
    const ts = value as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1e6);
    }
  }
  return null;
}

function isExternalSource(payment: Pick<StoredPayment, "fromAccountId" | "sourceType">) {
  return payment.sourceType === "external" || payment.fromAccountId === "external";
}

function paymentEventSnapshot(payment: StoredPayment): LedgerEventSnapshot {
  const date = typeof payment.date === "string" ? payment.date : "";
  return stripUndefined({
    amount: moneyOf(payment.amount),
    date,
    month: date.slice(0, 7),
    accountId: payment.fromAccountId || null,
    note: typeof payment.note === "string" ? payment.note : "",
    toAccountId: payment.toAccountId || undefined,
    sourceType: payment.sourceType || undefined,
    creditCardBillId: payment.creditCardBillId || undefined,
  });
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

  const ops: MutationOp[] = [
    {
      op: "set",
      ref: doc(db, "users", owner, "accountPayments", paymentId),
      data: stripUndefined({
        fromAccountId:
          input.sourceType === "external" ? "external" : input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: roundMoney(Math.abs(Number(input.amount) || 0)),
        date: input.date,
        note: input.note?.trim() || "",
        sourceType: input.sourceType,
        creditCardBillId: input.bill?.id,
        billAppliedAmount:
          input.bill && settleable > 0 ? roundMoney(settleable) : undefined,
        appliedCycleStart: input.appliedCycleStart,
        appliedCycleEnd: input.appliedCycleEnd,
        createdAt: serverTimestamp(),
      }),
    },
  ];
  if (input.bill && settleable > 0) {
    ops.push({
      op: "update",
      ref: doc(db, "users", owner, "creditCardBills", input.bill.id),
      data: {
        amountPaid: increment(settleable),
        paymentIds: arrayUnion(paymentId),
        paymentDate: input.date,
        remainingAmount: derived!.remainingAmount,
        status: derived!.status,
        updatedAt: serverTimestamp(),
      },
    });
  }
  const accountTypes = await import("@/services/ledger/fetchAccountTypes").then(m => m.fetchAccountTypes(db, owner, [input.fromAccountId, input.toAccountId]));
  const balanceDeltas: any[] = [];
  if (input.sourceType !== "external" && input.fromAccountId) {
    balanceDeltas.push({ accountId: input.fromAccountId, amountDelta: -input.amount, isCreditCard: false, oldBalance: accountTypes.get(input.fromAccountId)?.oldBalance, oldOutstanding: accountTypes.get(input.fromAccountId)?.oldOutstanding });
  }
  if (input.toAccountId) {
    // Bill payment: reduces outstanding, but does NOT affect unbilled spend.
    balanceDeltas.push({ accountId: input.toAccountId, amountDelta: input.amount, isCreditCard: true, isUnbilled: false, oldBalance: accountTypes.get(input.toAccountId)?.oldBalance, oldOutstanding: accountTypes.get(input.toAccountId)?.oldOutstanding });
  }

  const { buildAccountBalanceOps } = await import("@/shared/utils/balanceMutations");
  const balOps = buildAccountBalanceOps(owner, balanceDeltas);
  ops.push(...balOps);

  const outcome = await commitMutations(owner, ops, {
    label: "credit card bill payment",
  });

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

  const data = snapshot.data() as StoredPayment;
  if (data.voidedAt) {
    return { outcome: "acked" };
  }

  const billId = typeof data.creditCardBillId === "string" ? data.creditCardBillId : "";
  let derived: { remainingAmount: number; status: CreditCardBillStatus } | undefined;
  let applied = 0;

  if (billId) {
    const billSnap = await getDoc(doc(db, "users", owner, "creditCardBills", billId));
    if (billSnap.exists()) {
      const bill = billSnap.data() as StoredBill;
      // Reverse only what this payment stamped. Subtracting the full amount
      // undercounted the bill whenever the payment was larger than what the
      // statement still owed when it was recorded.
      applied = appliedAmountOf(paymentId, data, bill);
      derived = derivedBillFields({
        statementAmount: Number(bill.statementAmount) || 0,
        amountPaid: roundMoney(moneyOf(bill.amountPaid) - applied),
        dueDate: String(bill.dueDate || ""),
        status: bill.status ?? "UPCOMING",
        timezone: options?.timezone ?? "",
      });
    }
  }

  const ops: MutationOp[] = [
    {
      op: "update",
      ref: paymentRef,
      data: stripUndefined({
        voidedAt: new Date().toISOString(),
        voidReason: options?.reason?.trim() || "Payment removed",
        updatedAt: serverTimestamp(),
      }),
    },
  ];
  if (billId && derived) {
    ops.push({
      op: "update",
      ref: doc(db, "users", owner, "creditCardBills", billId),
      data: {
        ...(applied > 0 ? { amountPaid: increment(-applied) } : {}),
        paymentIds: arrayRemove(paymentId),
        remainingAmount: derived.remainingAmount,
        status: derived.status,
        updatedAt: serverTimestamp(),
      },
    });
  }
  const accountTypes = await import("@/services/ledger/fetchAccountTypes").then(m => m.fetchAccountTypes(db, owner, [data.fromAccountId, data.toAccountId]));
  const balanceDeltas: any[] = [];
  if (data.sourceType !== "external" && data.fromAccountId) {
    balanceDeltas.push({ accountId: data.fromAccountId, amountDelta: Number(data.amount) || 0, isCreditCard: false, oldBalance: accountTypes.get(data.fromAccountId)?.oldBalance, oldOutstanding: accountTypes.get(data.fromAccountId)?.oldOutstanding });
  }
  if (data.toAccountId) {
    // Reversing bill payment: increases outstanding back up, but does NOT affect unbilled spend.
    balanceDeltas.push({ accountId: data.toAccountId, amountDelta: -Number(data.amount) || 0, isCreditCard: true, isUnbilled: false, oldBalance: accountTypes.get(data.toAccountId)?.oldBalance, oldOutstanding: accountTypes.get(data.toAccountId)?.oldOutstanding });
  }

  const { buildAccountBalanceOps } = await import("@/shared/utils/balanceMutations");
  const balOps = buildAccountBalanceOps(owner, balanceDeltas);
  ops.push(...balOps);

  const outcome = await commitMutations(owner, ops, {
    label: "credit card bill payment reversal",
  });

  return { outcome, billStatus: derived?.status };
}

export const BILL_PAYMENT_EDIT_CONFLICT_MESSAGE =
  "This payment was changed on another device. Reopen it and try again.";

export type EditCreditBillPaymentPatch = {
  /** A bank/wallet account id, ignored when `sourceType` is external. */
  fromAccountId: string;
  sourceType: CreditBillPaymentSource;
  amount: number;
  date: string;
  note?: string;
};

export type EditCreditBillPaymentOptions = {
  /**
   * `updatedAt` of the payment the form was opened on. A different stored
   * value means another device edited it since, and this edit is refused
   * rather than silently overwriting that one.
   */
  expectedUpdatedAt: unknown;
  timezone?: string;
  reason?: string;
};

export type EditCreditBillPaymentResult = {
  outcome: WriteOutcome;
  /** False when the patch matched what is stored and nothing was written. */
  changed: boolean;
  billId?: string;
  billStatus?: CreditCardBillStatus;
};

/**
 * Corrects a recorded bill payment in place (SPENDLY-385).
 *
 * One batch: the payment row (same id — never a second payment), the bill
 * stamp moved by the change in what this payment applies to it, and an
 * append-only `ledgerEvents` row with the before/after.
 *
 * A source-only fix (wrong bank, external ↔ bank) leaves the bill untouched:
 * bank balances read `fromAccountId` off the payment, so the old bank stops
 * carrying the debit and the new one starts, with settlement unchanged.
 *
 * Replays are safe: a retry re-reads the already-updated payment, matches the
 * patch, and writes nothing.
 */
export async function editCreditBillPayment(
  uid: string,
  paymentId: string,
  patch: EditCreditBillPaymentPatch,
  options: EditCreditBillPaymentOptions
): Promise<EditCreditBillPaymentResult> {
  const owner = requireUid(uid);
  const db = requireDb();
  const paymentRef = doc(db, "users", owner, "accountPayments", paymentId);
  const snapshot = await getDoc(paymentRef);
  if (!snapshot.exists()) throw new Error("Payment not found");

  const before = snapshot.data() as StoredPayment;
  if (before.voidedAt) throw new Error("This payment was removed and can't be edited");
  if (
    before.sourceType === "cashback" ||
    before.fromAccountId === CASHBACK_SOURCE_ID
  ) {
    throw new Error("Cashback can't be edited as a bill payment");
  }
  if (
    timestampMillis(before.updatedAt) !== timestampMillis(options.expectedUpdatedAt)
  ) {
    throw new Error(BILL_PAYMENT_EDIT_CONFLICT_MESSAGE);
  }

  const toAccountId = String(before.toAccountId || "");
  const external = patch.sourceType === "external";
  const fromAccountId = external ? "external" : patch.fromAccountId;
  const amount = roundMoney(Math.abs(Number(patch.amount) || 0));
  const date = patch.date.trim();
  const note = patch.note?.trim() || "";

  if (external) {
    if (!(amount > 0)) throw new Error("Enter a valid amount");
    if (!isValidDateKey(date)) throw new Error("Invalid payment date");
  } else {
    const validation = validateAccountMoneyMove({
      fromAccountId,
      toAccountId,
      amount,
      date,
    });
    if (!validation.ok) throw new Error(validation.error);
  }

  const beforeAmount = moneyOf(before.amount);
  const beforeDate = String(before.date || "");
  const sourceChanged =
    fromAccountId !== String(before.fromAccountId || "") ||
    external !== isExternalSource(before);
  const amountChanged = amount !== beforeAmount;
  const dateChanged = date !== beforeDate;
  const noteChanged = note !== (before.note ?? "").trim();

  if (!sourceChanged && !amountChanged && !dateChanged && !noteChanged) {
    return { outcome: "acked", changed: false };
  }

  if (sourceChanged && !external) {
    const accountSnap = await getDoc(doc(db, "users", owner, "accounts", fromAccountId));
    if (!accountSnap.exists()) throw new Error("That bank account no longer exists");
  }

  const billId = typeof before.creditCardBillId === "string" ? before.creditCardBillId : "";
  let bill: StoredBill | undefined;
  if (billId) {
    const billSnap = await getDoc(doc(db, "users", owner, "creditCardBills", billId));
    if (!billSnap.exists()) throw new Error("The bill for this payment no longer exists");
    bill = billSnap.data() as StoredBill;
  }

  // A statement only absorbs payments made on or after its statement date
  // (the card ledger applies the same rule), so re-dating a payment earlier
  // would silently detach it from the bill it was recorded against.
  const statementDate = String(bill?.statementDate || "");
  if (bill && dateChanged && statementDate && date < statementDate) {
    throw new Error(
      `This payment is for the statement dated ${statementDate}, so it can't be dated earlier`
    );
  }

  const ops: MutationOp[] = [];
  let derived: { remainingAmount: number; status: CreditCardBillStatus } | undefined;
  let newApplied: number | undefined;

  if (bill) {
    const storedPaid = moneyOf(bill.amountPaid);
    const statementAmount = moneyOf(bill.statementAmount);
    const oldApplied = appliedAmountOf(paymentId, before, bill);
    newApplied = oldApplied;

    // Settlement only moves when the amount does. A source, date or note fix
    // must never turn a paid bill unpaid.
    if (amountChanged) {
      const others = Math.max(0, roundMoney(storedPaid - oldApplied));
      newApplied = roundMoney(
        Math.max(0, Math.min(amount, statementAmount - others))
      );
    }
    const delta = roundMoney(newApplied - oldApplied);
    const linked = Array.isArray(bill.paymentIds) && bill.paymentIds.includes(paymentId);
    const movePaymentDate =
      dateChanged && Boolean(bill.paymentDate) && bill.paymentDate === beforeDate;

    if (delta !== 0 || movePaymentDate || (newApplied > 0 && !linked)) {
      derived = derivedBillFields({
        statementAmount,
        amountPaid: roundMoney(storedPaid + delta),
        dueDate: String(bill.dueDate || ""),
        status: bill.status ?? "UPCOMING",
        timezone: options.timezone ?? "",
      });
      ops.push({
        op: "update",
        ref: doc(db, "users", owner, "creditCardBills", billId),
        data: {
          ...(delta !== 0 ? { amountPaid: increment(delta) } : {}),
          ...(newApplied > 0 && !linked ? { paymentIds: arrayUnion(paymentId) } : {}),
          ...(movePaymentDate ? { paymentDate: date } : {}),
          remainingAmount: derived.remainingAmount,
          status: derived.status,
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  const after: StoredPayment = {
    ...before,
    fromAccountId,
    sourceType: patch.sourceType,
    amount,
    date,
    note,
  };

  ops.unshift({
    op: "update",
    ref: paymentRef,
    data: stripUndefined({
      fromAccountId,
      sourceType: patch.sourceType,
      amount,
      date,
      note,
      billAppliedAmount: newApplied,
      updatedAt: serverTimestamp(),
    }),
  });
  ops.push({
    op: "set",
    ref: doc(collection(db, "users", owner, "ledgerEvents")),
    data: stripUndefined({
      kind: "payment",
      docId: paymentId,
      action: "update",
      before: paymentEventSnapshot(before),
      after: paymentEventSnapshot(after),
      actorUid: owner,
      reason: options.reason?.trim() || undefined,
      createdAt: serverTimestamp(),
    }),
  });

  const accountTypes = await import("@/services/ledger/fetchAccountTypes").then(m => m.fetchAccountTypes(db, owner, [before.fromAccountId, before.toAccountId, fromAccountId]));
  const balanceDeltas: any[] = [];
  
  // Revert before
  if (before.sourceType !== "external" && before.fromAccountId) {
    balanceDeltas.push({ accountId: before.fromAccountId, amountDelta: Number(before.amount) || 0, isCreditCard: false, oldBalance: accountTypes.get(before.fromAccountId)?.oldBalance, oldOutstanding: accountTypes.get(before.fromAccountId)?.oldOutstanding });
  }
  if (before.toAccountId) {
    balanceDeltas.push({ accountId: before.toAccountId, amountDelta: -Number(before.amount) || 0, isCreditCard: true, isUnbilled: false, oldBalance: accountTypes.get(before.toAccountId)?.oldBalance, oldOutstanding: accountTypes.get(before.toAccountId)?.oldOutstanding });
  }

  // Apply after
  if (patch.sourceType !== "external" && fromAccountId) {
    balanceDeltas.push({ accountId: fromAccountId, amountDelta: -amount, isCreditCard: false, oldBalance: accountTypes.get(fromAccountId)?.oldBalance, oldOutstanding: accountTypes.get(fromAccountId)?.oldOutstanding });
  }
  if (before.toAccountId) { // edit doesn't change toAccountId
    balanceDeltas.push({ accountId: before.toAccountId, amountDelta: amount, isCreditCard: true, isUnbilled: false, oldBalance: accountTypes.get(before.toAccountId)?.oldBalance, oldOutstanding: accountTypes.get(before.toAccountId)?.oldOutstanding });
  }

  const { buildAccountBalanceOps } = await import("@/shared/utils/balanceMutations");
  const balOps = buildAccountBalanceOps(owner, balanceDeltas);
  ops.push(...balOps);

  const outcome = await commitMutations(owner, ops, {
    label: "credit card bill payment edit",
  });

  return {
    outcome,
    changed: true,
    billId: billId || undefined,
    billStatus: derived?.status ?? bill?.status,
  };
}
