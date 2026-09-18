/**
 * Journal edit and soft-delete (SPENDLY-38).
 *
 * Create still lives in `createLedgerTransaction.ts`. Edits used to
 * `updateDoc` in place from ExpenseForm, and deletes were a hard `deleteDoc`
 * from ExpenseList — no audit row, and `trips.spentAmount` never moved.
 *
 * Every mutation here is one `writeBatch`: live row + append-only
 * `ledgerEvents` + optional trip `increment`. Split-owned expenses are
 * refused; reversing those is SPENDLY-39.
 */

import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import { commitMutations, type MutationOp } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { roundMoney } from "@/shared/utils/money";
import { currentMonthKey, isValidDateKey } from "@/shared/utils/dates";
import {
  ALREADY_REMOVED_LEDGER_MESSAGE,
  PAST_MONTH_LOCKED_MESSAGE,
  SPLIT_OWNED_LEDGER_MESSAGE,
  isActiveLedgerRow,
  ledgerEventSnapshot,
} from "@/shared/utils/ledgerRow";
import type {
  LedgerEventAction,
  LedgerEventKind,
  LedgerEventSnapshot,
} from "@/shared/types/ledgerEvent";

import type {
  CreateExpenseInput,
  CreateIncomeInput,
  LedgerWriteResult,
} from "./createLedgerTransaction";

export {
  ALREADY_REMOVED_LEDGER_MESSAGE,
  PAST_MONTH_LOCKED_MESSAGE,
  SPLIT_OWNED_LEDGER_MESSAGE,
};

export type LedgerMutationOptions = {
  lockPastMonths?: boolean;
  timezone?: string;
  reason?: string;
};

export class LedgerMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerMutationError";
  }
}

type ExpenseUpdateInput = CreateExpenseInput;
type IncomeUpdateInput = CreateIncomeInput;

function requireUidAndDb(uid: string): { owner: string; db: Firestore } {
  if (!uid.trim()) {
    throw new LedgerMutationError("Not authenticated");
  }
  const db = getFirestoreDb();
  if (!db) {
    throw new LedgerMutationError("Firestore is not available");
  }
  return { owner: uid, db };
}

function requireDocId(id: string | undefined, kind: LedgerEventKind): string {
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    throw new LedgerMutationError(
      kind === "expense"
        ? "Cannot update expense — missing id"
        : "Cannot update income — missing id"
    );
  }
  return trimmed;
}

function requirePositiveAmount(amount: number): number {
  const rounded = roundMoney(amount);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new LedgerMutationError("Please enter a valid amount");
  }
  return rounded;
}

function assertUnlockedMonth(
  month: string | undefined,
  options?: LedgerMutationOptions
) {
  if (!options?.lockPastMonths) return;
  const activeMonth = currentMonthKey(options.timezone);
  if (month && month < activeMonth) {
    throw new LedgerMutationError(PAST_MONTH_LOCKED_MESSAGE);
  }
}

function assertLiveAndMutable(
  data: Record<string, unknown>,
  options?: LedgerMutationOptions
) {
  if (!isActiveLedgerRow(data)) {
    throw new LedgerMutationError(ALREADY_REMOVED_LEDGER_MESSAGE);
  }
  const splitId =
    typeof data.splitId === "string" ? data.splitId.trim() : "";
  if (splitId) {
    throw new LedgerMutationError(SPLIT_OWNED_LEDGER_MESSAGE);
  }
  const month = typeof data.month === "string" ? data.month : undefined;
  assertUnlockedMonth(month, options);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const result = { ...value };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

async function loadRow(
  db: Firestore,
  owner: string,
  collectionName: "expenses" | "incomes",
  id: string
): Promise<{ ref: DocumentReference; data: Record<string, unknown> }> {
  const ref = doc(db, "users", owner, collectionName, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new LedgerMutationError("Transaction not found");
  }
  return { ref, data: (snap.data() ?? {}) as Record<string, unknown> };
}

function tripIdOf(data: Record<string, unknown>): string | null {
  if (typeof data.tripId !== "string") return null;
  const trimmed = data.tripId.trim();
  return trimmed ? trimmed : null;
}

function applyTripIncrement(
  ops: MutationOp[],
  db: Firestore,
  owner: string,
  data: Record<string, unknown>,
  delta: number
) {
  const tripId = tripIdOf(data);
  if (!tripId) return;
  const rounded = roundMoney(delta);
  if (rounded === 0) return;
  ops.push({
    op: "update",
    ref: doc(db, "users", owner, "trips", tripId),
    data: { spentAmount: increment(rounded) },
  });
}

function writeEvent(
  ops: MutationOp[],
  db: Firestore,
  owner: string,
  input: {
    kind: LedgerEventKind;
    docId: string;
    action: LedgerEventAction;
    before: LedgerEventSnapshot;
    after: LedgerEventSnapshot | null;
    reason?: string;
  }
) {
  const eventRef = doc(collection(db, "users", owner, "ledgerEvents"));
  ops.push({
    op: "set",
    ref: eventRef,
    data: stripUndefined({
      kind: input.kind,
      docId: input.docId,
      action: input.action,
      before: input.before,
      after: input.after,
      actorUid: owner,
      reason: input.reason,
      createdAt: serverTimestamp(),
    }),
  });
  return eventRef.id;
}

export async function updateExpense(
  uid: string,
  id: string,
  payload: ExpenseUpdateInput,
  options?: LedgerMutationOptions
): Promise<LedgerWriteResult> {
  const { owner, db } = requireUidAndDb(uid);
  const docId = requireDocId(id, "expense");
  const amount = requirePositiveAmount(payload.amount);
  if (!isValidDateKey(payload.date)) {
    throw new LedgerMutationError("Please choose a date");
  }
  assertUnlockedMonth(payload.month, options);

  const { ref, data } = await loadRow(db, owner, "expenses", docId);
  assertLiveAndMutable(data, options);

  const afterRow = {
    ...data,
    amount,
    category: payload.category.trim(),
    subcategory: payload.subcategory.trim() || "Other",
    date: payload.date.trim(),
    month: payload.month,
    accountId: payload.accountId || null,
    note: payload.note.trim(),
    tags: payload.tags.length > 0 ? payload.tags : [],
    spaceId: payload.spaceId || null,
  };
  const before = ledgerEventSnapshot(data);
  const after = ledgerEventSnapshot(afterRow);
  const delta = roundMoney(amount - before.amount);

  const outcome = await commitMutations(
    owner,
    (() => {
      const ops: MutationOp[] = [
        {
          op: "update",
          ref,
          data: stripUndefined({
            amount,
            category: afterRow.category,
            subcategory: afterRow.subcategory,
            date: afterRow.date,
            month: afterRow.month,
            accountId: afterRow.accountId,
            note: afterRow.note,
            tags: afterRow.tags,
            spaceId: afterRow.spaceId,
            updatedAt: serverTimestamp(),
          }),
        },
      ];
      writeEvent(ops, db, owner, {
        kind: "expense",
        docId,
        action: "update",
        before,
        after,
        reason: options?.reason,
      });
      applyTripIncrement(ops, db, owner, data, delta);
      return ops;
    })(),
    { label: "expense" }
  );
  return { id: docId, outcome };
}

export async function updateIncome(
  uid: string,
  id: string,
  payload: IncomeUpdateInput,
  options?: LedgerMutationOptions
): Promise<LedgerWriteResult> {
  const { owner, db } = requireUidAndDb(uid);
  const docId = requireDocId(id, "income");
  const amount = requirePositiveAmount(payload.amount);
  if (!isValidDateKey(payload.date)) {
    throw new LedgerMutationError("Please choose a date");
  }
  assertUnlockedMonth(payload.month, options);

  const { ref, data } = await loadRow(db, owner, "incomes", docId);
  assertLiveAndMutable(data, options);

  const afterRow = {
    ...data,
    amount,
    source: payload.source.trim() || "Salary",
    date: payload.date.trim(),
    month: payload.month,
    accountId: payload.accountId || null,
    note: payload.note.trim(),
  };
  const before = ledgerEventSnapshot(data);
  const after = ledgerEventSnapshot(afterRow);

  const outcome = await commitMutations(
    owner,
    (() => {
      const ops: MutationOp[] = [
        {
          op: "update",
          ref,
          data: stripUndefined({
            amount,
            source: afterRow.source,
            date: afterRow.date,
            month: afterRow.month,
            accountId: afterRow.accountId,
            note: afterRow.note,
            updatedAt: serverTimestamp(),
          }),
        },
      ];
      writeEvent(ops, db, owner, {
        kind: "income",
        docId,
        action: "update",
        before,
        after,
        reason: options?.reason,
      });
      return ops;
    })(),
    { label: "income" }
  );
  return { id: docId, outcome };
}

async function softDeleteRow(
  uid: string,
  id: string,
  kind: LedgerEventKind,
  options?: LedgerMutationOptions
): Promise<LedgerWriteResult> {
  const { owner, db } = requireUidAndDb(uid);
  const collectionName = kind === "expense" ? "expenses" : "incomes";
  const docId = requireDocId(
    id,
    kind === "expense" ? "expense" : "income"
  );
  const { ref, data } = await loadRow(db, owner, collectionName, docId);
  assertLiveAndMutable(data, options);

  const before = ledgerEventSnapshot(data);
  const deletedAt = new Date().toISOString();

  const outcome = await commitMutations(
    owner,
    (() => {
      const ops: MutationOp[] = [
        {
          op: "update",
          ref,
          data: stripUndefined({
            deletedAt,
            deletedBy: owner,
            deletedReason: options?.reason,
            updatedAt: serverTimestamp(),
          }),
        },
      ];
      writeEvent(ops, db, owner, {
        kind,
        docId,
        action: "delete",
        before,
        after: null,
        reason: options?.reason,
      });
      if (kind === "expense") {
        applyTripIncrement(ops, db, owner, data, -before.amount);
      }
      return ops;
    })(),
    { label: "transaction deletion" }
  );
  return { id: docId, outcome };
}

export async function softDeleteExpense(
  uid: string,
  id: string,
  options?: LedgerMutationOptions
): Promise<LedgerWriteResult> {
  return softDeleteRow(uid, id, "expense", options);
}

export async function softDeleteIncome(
  uid: string,
  id: string,
  options?: LedgerMutationOptions
): Promise<LedgerWriteResult> {
  return softDeleteRow(uid, id, "income", options);
}
