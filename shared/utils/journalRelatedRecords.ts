/**
 * SPENDLY-110 — "what else is connected to this transaction?"
 *
 * A journal row rarely stands alone. A card purchase belongs to a statement
 * that was later paid; a refund arrived as a cashback credit against it; a
 * holiday expense belongs to a trip; a recurring charge came from a
 * subscription. None of that is visible today: the detail sheet shows the row
 * and nothing around it.
 *
 * ## Read-only, and deliberately so
 *
 * Everything here is **context for a person**, never an input to a total. The
 * Journal's row set is exactly one record per `Expense` and one per `Income`
 * (SPENDLY-109), which is what makes its spending figures impossible to
 * double-count. A credit-card purchase is already in that set, so its bill
 * payment must never be added to it — surfacing the payment here is safe
 * precisely because these results feed a detail panel and nothing else.
 *
 * If a later ticket wants any of this in a total, it has to go through the
 * row-set rules in `journalActivities.ts` first, not through this file.
 */

import type {
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "@/shared/types/expense";
import { isCashbackPayment } from "@/shared/types/expense";

export type JournalRelationKind =
  | "cashback"
  | "bill"
  | "billPayment"
  | "split"
  | "trip"
  | "space"
  | "subscription"
  | "investment"
  | "smsImport"
  | "statementImport";

export interface JournalRelatedRecord {
  kind: JournalRelationKind;
  /** Short label for the row, e.g. "Cashback received". */
  label: string;
  /** The connected record's id, when there is one to navigate to. */
  recordId?: string;
  /** Money involved, when the relation has an amount of its own. */
  amount?: number;
  date?: string;
  /** One line of context, e.g. why this is connected. */
  detail?: string;
  /**
   * True when the related record represents money that is *already* counted by
   * the journal row itself. Callers must not add it to any total.
   */
  isSameMoney: boolean;
}

export interface JournalRelatedRecordsInput {
  expense?: Expense;
  income?: Income;
  payments?: AccountPayment[];
  entries?: AccountEntry[];
  transfers?: AccountTransfer[];
  /** Resolves a trip/space/subscription id to a name, when the caller has one. */
  nameById?: (id: string) => string | undefined;
}

function isLivePayment(payment: AccountPayment): boolean {
  return !payment.voidedAt;
}

/**
 * Cashback credited against this specific expense. Cashback is an
 * `AccountPayment` with `sourceType: "cashback"` — never an `Income` — so it
 * is not in the Journal and cannot have been counted as earnings.
 */
function cashbackFor(
  expenseId: string,
  payments: AccountPayment[]
): JournalRelatedRecord[] {
  return payments
    .filter(
      (payment) =>
        isLivePayment(payment) &&
        isCashbackPayment(payment) &&
        payment.linkedExpenseId === expenseId
    )
    .map((payment) => ({
      kind: "cashback" as const,
      label:
        payment.cashbackKind === "statement_credit"
          ? "Statement credit received"
          : "Cashback received",
      recordId: payment.id,
      amount: payment.amount,
      date: payment.date,
      detail: payment.providerRef
        ? `Reference ${payment.providerRef}`
        : undefined,
      // Cashback is separate money arriving, not a re-counting of the purchase.
      isSameMoney: false,
    }));
}

/**
 * The statement this purchase was billed to, and the payments that settled it.
 *
 * The payments are flagged `isSameMoney` because the purchase is already in
 * the Journal: counting the bill payment as spending too would double-count
 * the identical rupees. This flag is the guard rail.
 */
function billFor(
  expense: Expense,
  payments: AccountPayment[]
): JournalRelatedRecord[] {
  const billId = expense.creditCardBillId?.trim();
  if (!billId) return [];

  const records: JournalRelatedRecord[] = [
    {
      kind: "bill",
      label: "Billed to statement",
      recordId: billId,
      detail: "This purchase appears on a credit-card statement",
      isSameMoney: true,
    },
  ];

  for (const payment of payments) {
    if (!isLivePayment(payment)) continue;
    if (isCashbackPayment(payment)) continue;
    if (payment.creditCardBillId !== billId) continue;
    records.push({
      kind: "billPayment",
      label: "Statement paid",
      recordId: payment.id,
      amount: payment.amount,
      date: payment.date,
      detail: "Settles the statement this purchase is on, not the purchase itself",
      isSameMoney: true,
    });
  }

  return records;
}

function investmentFor(
  expense: Expense | undefined,
  income: Income | undefined,
  entries: AccountEntry[]
): JournalRelatedRecord[] {
  const accountId = expense?.accountId ?? income?.accountId;
  const date = expense?.date ?? income?.date;
  const amount = expense?.amount ?? income?.amount;
  if (!accountId || !date || amount === undefined) return [];

  // An investment movement is an AccountEntry carrying a transferId or
  // correlationId — the pairing key it shares with the portfolio ledger.
  return entries
    .filter(
      (entry) =>
        entry.accountId === accountId &&
        entry.date === date &&
        Math.abs(entry.amount - amount) < 0.005 &&
        Boolean(entry.transferId || entry.correlationId)
    )
    .map((entry) => ({
      kind: "investment" as const,
      label: "Investment movement",
      recordId: entry.id,
      amount: entry.amount,
      date: entry.date,
      detail: entry.note || "Paired with the portfolio ledger",
      isSameMoney: true,
    }));
}

function tagRelations(
  expense: Expense | undefined,
  nameById?: (id: string) => string | undefined
): JournalRelatedRecord[] {
  if (!expense) return [];
  const records: JournalRelatedRecord[] = [];
  const name = (id: string) => nameById?.(id);

  if (expense.splitId) {
    records.push({
      kind: "split",
      label: "Part of a split",
      recordId: expense.splitId,
      detail: "Edits and deletes are managed from the split",
      isSameMoney: true,
    });
  }
  if (expense.tripId) {
    records.push({
      kind: "trip",
      label: name(expense.tripId) ?? "Part of a trip",
      recordId: expense.tripId,
      detail: "Counts towards this trip's spend",
      isSameMoney: true,
    });
  }
  if (expense.spaceId) {
    records.push({
      kind: "space",
      label: name(expense.spaceId) ?? "Assigned to a space",
      recordId: expense.spaceId,
      isSameMoney: true,
    });
  }
  if (expense.subscriptionId) {
    records.push({
      kind: "subscription",
      label: name(expense.subscriptionId) ?? "Generated by a subscription",
      recordId: expense.subscriptionId,
      detail: "Created automatically from a recurring charge",
      isSameMoney: true,
    });
  }
  return records;
}

function provenanceRelations(
  expense: Expense | undefined,
  income: Income | undefined
): JournalRelatedRecord[] {
  const records: JournalRelatedRecord[] = [];
  const smsRef =
    expense?.smsExternalRef ??
    income?.smsExternalRef ??
    expense?.smsFingerprint ??
    income?.smsFingerprint;
  if (smsRef) {
    records.push({
      kind: "smsImport",
      label: "Imported from SMS",
      detail: expense?.smsMatchStatus ?? income?.smsMatchStatus,
      isSameMoney: true,
    });
  }
  if (expense?.statementImportFingerprint) {
    records.push({
      kind: "statementImport",
      label: "Imported from a statement",
      detail: "Matched by import fingerprint, so a re-import cannot duplicate it",
      isSameMoney: true,
    });
  }
  return records;
}

/**
 * Everything connected to one journal row, in display order: money that
 * arrived or moved first, then the groupings it belongs to, then how it got
 * into the ledger.
 *
 * Returns an empty array for a row with no connections, which is the common
 * case — callers should render nothing rather than an empty section.
 */
export function findJournalRelatedRecords(
  input: JournalRelatedRecordsInput
): JournalRelatedRecord[] {
  const { expense, income } = input;
  const payments = input.payments ?? [];
  const entries = input.entries ?? [];

  const records: JournalRelatedRecord[] = [];

  if (expense?.id) records.push(...cashbackFor(expense.id, payments));
  if (expense) records.push(...billFor(expense, payments));
  records.push(...investmentFor(expense, income, entries));
  records.push(...tagRelations(expense, input.nameById));
  records.push(...provenanceRelations(expense, income));

  return records;
}

/**
 * Money shown in the related list that is *not* already counted by the journal
 * row — currently only cashback. Exposed so a caller can state the difference
 * explicitly rather than leaving a reader to assume every figure adds up.
 */
export function separateMoneyTotal(records: JournalRelatedRecord[]): number {
  return records
    .filter((record) => !record.isSameMoney && record.amount !== undefined)
    .reduce((sum, record) => sum + (record.amount ?? 0), 0);
}
