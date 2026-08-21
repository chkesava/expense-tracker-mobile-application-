import type {
  Account,
  AccountActivity,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { postingSortMs, resolveActivityClockTime } from "./activityDisplay";
import { effectiveBalanceAsOfDate } from "./accountBaseline";
import { getAccountKind } from "./accountKind";
import {
  getBillingCycleDates,
  getDaysUntilReset,
  isDateKeyInHalfOpenRange,
  isDateKeyInInclusiveRange,
  normalizeBillGenerationDay,
} from "./billingCycle";
import {
  billDateForMonth,
  todayDateKey,
  toLocalDateKey,
} from "./dates";

export { toLocalDateKey } from "./dates";

/**
 * Rounds to the nearest cent. Every balance/usage figure below is a running
 * sum of many decimal amounts (float addition/subtraction accumulates
 * epsilon-level residue, e.g. 0.1 + 0.2 !== 0.3) — without this, exact
 * comparisons like `outstanding === 0` can stay false for a bill that's
 * genuinely fully paid.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paymentBelongsToCycle(
  payment: AccountPayment,
  cycleStart: Date,
  cycleEnd: Date,
  inclusiveEnd = false
): boolean {
  const startKey = toLocalDateKey(cycleStart);
  const endKey = toLocalDateKey(cycleEnd);
  if (payment.appliedCycleStart || payment.appliedCycleEnd) {
    return (
      payment.appliedCycleStart === startKey &&
      payment.appliedCycleEnd === endKey
    );
  }
  const note = payment.note || "";
  const noteRangeMatch = note.match(/(.+?)\s-\s(.+)$/);
  if (noteRangeMatch) {
    const parsedStart = new Date(noteRangeMatch[1].replace(/^.*?—\s*/, "").trim());
    const parsedEnd = new Date(noteRangeMatch[2].trim());
    if (
      Number.isFinite(parsedStart.getTime()) &&
      Number.isFinite(parsedEnd.getTime())
    ) {
      return (
        toLocalDateKey(parsedStart) === startKey &&
        toLocalDateKey(parsedEnd) === endKey
      );
    }
  }
  return inclusiveEnd
    ? isDateKeyInInclusiveRange(payment.date, cycleStart, cycleEnd)
    : isDateKeyInHalfOpenRange(payment.date, cycleStart, cycleEnd);
}

function paymentsFromAccount(accountId: string, payments: AccountPayment[]) {
  return payments.filter((p) => p.fromAccountId === accountId);
}

function paymentsToAccount(accountId: string, payments: AccountPayment[]) {
  return payments.filter((p) => p.toAccountId === accountId);
}

function getPaymentCounterpartyName(
  payment: AccountPayment,
  direction: "incoming" | "outgoing",
  accountNameById?: Record<string, string>
): string {
  if (payment.sourceType === "external" || payment.fromAccountId === "external") {
    return "Already paid";
  }
  if (direction === "outgoing") {
    return accountNameById?.[payment.toAccountId] ?? "Credit card";
  }
  return accountNameById?.[payment.fromAccountId] ?? "Bank account";
}

function entriesForAccount(accountId: string, entries: AccountEntry[]) {
  return entries.filter((e) => e.accountId === accountId);
}

function transfersFromAccount(accountId: string, transfers: AccountTransfer[]) {
  return transfers.filter((transfer) => transfer.fromAccountId === accountId);
}

function transfersToAccount(accountId: string, transfers: AccountTransfer[]) {
  return transfers.filter((transfer) => transfer.toAccountId === accountId);
}

function isOnOrAfter(date: string, baseline?: string): boolean {
  if (!baseline) return true;
  return date >= baseline;
}

/** Borrowed money credited into this account. A liability, never income. */
function borrowingsCreditedTo(accountId: string, borrowings: Borrowing[]) {
  return borrowings.filter((b) => b.creditedAccountId === accountId);
}

/** Loan repayments paid out of this account. Not ordinary expenses. */
function repaymentsPaidFrom(
  accountId: string,
  repayments: BorrowingRepayment[]
) {
  return repayments.filter((r) => r.paymentAccountId === accountId);
}

/** Money lent out of this account. An asset conversion, never an expense. */
function receivablesPaidFrom(accountId: string, receivables: Receivable[]) {
  return receivables.filter((r) => r.sourceAccountId === accountId);
}

/** Collections received into this account. Never ordinary income. */
function receivableRepaymentsInto(
  accountId: string,
  repayments: ReceivableRepayment[]
) {
  return repayments.filter((r) => r.receivedAccountId === accountId);
}

function compareActivitiesChronologically(a: AccountActivity, b: AccountActivity) {
  const timeDiff = postingSortMs(a.date, a.time) - postingSortMs(b.date, b.time);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}

function paymentsInBillingCycle(
  accountId: string,
  payments: AccountPayment[],
  cycleStart: Date,
  cycleEnd: Date
) {
  return paymentsToAccount(accountId, payments).filter((p) => {
    return paymentBelongsToCycle(p, cycleStart, cycleEnd);
  });
}

export function computeBankBalance(
  account: Account,
  expenses: Expense[],
  incomes: Income[],
  payments: AccountPayment[] = [],
  entries: AccountEntry[] = [],
  transfers: AccountTransfer[] = [],
  borrowings: Borrowing[] = [],
  borrowingRepayments: BorrowingRepayment[] = [],
  receivables: Receivable[] = [],
  receivableRepayments: ReceivableRepayment[] = []
): number {
  const opening = account.openingBalance ?? 0;
  const baseline = effectiveBalanceAsOfDate(
    account.balanceAsOfDate,
    [],
    todayDateKey()
  );
  const totalExpenses = expenses
    .filter((e) => e.accountId === account.id && isOnOrAfter(e.date, baseline))
    .reduce((sum, e) => sum + e.amount, 0);
  const totalIncomes = incomes
    .filter((i) => i.accountId === account.id && isOnOrAfter(i.date, baseline))
    .reduce((sum, i) => sum + i.amount, 0);
  const billPaymentsOut = paymentsFromAccount(account.id, payments)
    .filter((p) => isOnOrAfter(p.date, baseline))
    .reduce((sum, p) => sum + p.amount, 0);
  const manualAdjustments = entriesForAccount(account.id, entries).reduce(
    (sum, entry) =>
      isOnOrAfter(entry.date, baseline)
        ? sum + (entry.direction === "credit" ? entry.amount : -entry.amount)
        : sum,
    0
  );
  const transfersOut = transfersFromAccount(account.id, transfers)
    .filter((transfer) => isOnOrAfter(transfer.date, baseline))
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const transfersIn = transfersToAccount(account.id, transfers)
    .filter((transfer) => isOnOrAfter(transfer.date, baseline))
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const borrowedIn = borrowingsCreditedTo(account.id, borrowings)
    .filter((borrowing) => isOnOrAfter(borrowing.borrowedDate, baseline))
    .reduce((sum, borrowing) => sum + borrowing.principalAmount, 0);
  const repaymentsOut = repaymentsPaidFrom(account.id, borrowingRepayments)
    .filter((repayment) => isOnOrAfter(repayment.date, baseline))
    .reduce((sum, repayment) => sum + repayment.amount, 0);
  const lentOut = receivablesPaidFrom(account.id, receivables)
    .filter((receivable) => isOnOrAfter(receivable.lentDate, baseline))
    .reduce((sum, receivable) => sum + receivable.originalAmount, 0);
  const collectionsIn = receivableRepaymentsInto(
    account.id,
    receivableRepayments
  )
    .filter((repayment) => isOnOrAfter(repayment.date, baseline))
    .reduce((sum, repayment) => sum + repayment.amount, 0);
  return roundMoney(
    opening +
    totalIncomes -
    totalExpenses -
    billPaymentsOut +
    manualAdjustments -
    transfersOut +
    transfersIn +
    borrowedIn -
    repaymentsOut -
    lentOut +
    collectionsIn
  );
}

export function computeCreditUsage(
  account: Account,
  expenses: Expense[],
  payments: AccountPayment[] = []
): {
  usedThisCycle: number;
  availableCredit: number;
  nextResetDate: Date;
  daysRemaining: number;
  paidThisCycle: number;
} {
  const billDay = normalizeBillGenerationDay(account.billGenerationDay) ?? 1;
  const { previousBillDate, nextBillDate } = getBillingCycleDates(billDay);

  const cycleExpenses = expenses.filter((e) => {
    if (e.accountId !== account.id) return false;
    return isDateKeyInHalfOpenRange(e.date, previousBillDate, nextBillDate);
  });

  const cyclePayments = paymentsInBillingCycle(
    account.id,
    payments,
    previousBillDate,
    nextBillDate
  );

  const expenseTotal = roundMoney(cycleExpenses.reduce((sum, e) => sum + e.amount, 0));
  const paidThisCycle = roundMoney(cyclePayments.reduce((sum, p) => sum + p.amount, 0));
  const usedThisCycle = roundMoney(Math.max(0, expenseTotal - paidThisCycle));
  const limit = account.creditLimit ?? 0;
  const availableCredit = roundMoney(Math.max(0, limit - usedThisCycle));

  return {
    usedThisCycle,
    availableCredit,
    nextResetDate: nextBillDate,
    daysRemaining: getDaysUntilReset(nextBillDate),
    paidThisCycle,
  };
}

export type CreditBillStatus = "unpaid" | "partiallyPaid" | "paid";

export interface CreditBillSummary {
  id: string;
  accountId: string;
  cycleStart: Date;
  cycleEnd: Date;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: CreditBillStatus;
}

export function getCreditBillHistory(
  account: Account,
  expenses: Expense[],
  payments: AccountPayment[] = [],
  cycles = 6
): CreditBillSummary[] {
  const billDay = normalizeBillGenerationDay(account.billGenerationDay) ?? 1;
  const { previousBillDate } = getBillingCycleDates(billDay);
  const history: CreditBillSummary[] = [];

  for (let i = 0; i < cycles; i += 1) {
    const cycleEndMonth = previousBillDate.getMonth() - i;
    const cycleEndYear = previousBillDate.getFullYear();
    const cycleEnd = billDateForMonth(cycleEndYear, cycleEndMonth, billDay);
    const cycleStart = billDateForMonth(cycleEndYear, cycleEndMonth - 1, billDay);

    const billedAmount = roundMoney(
      expenses
        .filter((e) => {
          if (e.accountId !== account.id) return false;
          return isDateKeyInInclusiveRange(e.date, cycleStart, cycleEnd);
        })
        .reduce((sum, e) => sum + e.amount, 0)
    );

    const paidAmount = roundMoney(
      payments
        .filter((p) => {
          if (p.toAccountId !== account.id) return false;
          return paymentBelongsToCycle(p, cycleStart, cycleEnd, true);
        })
        .reduce((sum, p) => sum + p.amount, 0)
    );

    if (billedAmount <= 0 && paidAmount <= 0) {
      continue;
    }

    const outstandingAmount = roundMoney(Math.max(0, billedAmount - paidAmount));
    const status: CreditBillStatus =
      outstandingAmount <= 0
        ? "paid"
        : paidAmount > 0
          ? "partiallyPaid"
          : "unpaid";

    history.push({
      id: `${account.id}-${toLocalDateKey(cycleStart)}`,
      accountId: account.id,
      cycleStart,
      cycleEnd,
      billedAmount,
      paidAmount,
      outstandingAmount,
      status,
    });
  }

  return history;
}

export function buildAccountActivities(
  account: Account,
  typeName: string,
  expenses: Expense[],
  incomes: Income[],
  payments: AccountPayment[] = [],
  entries: AccountEntry[] = [],
  transfers: AccountTransfer[] = [],
  accountNameById?: Record<string, string>,
  liabilities?: {
    borrowings?: Borrowing[];
    borrowingRepayments?: BorrowingRepayment[];
  },
  receivableFlows?: {
    receivables?: Receivable[];
    receivableRepayments?: ReceivableRepayment[];
  }
): AccountActivity[] {
  // Never hide ledger rows. A "balance as of" date only affects the running
  // header balance (via computeBankBalance), not whether history is listed.
  const kind = getAccountKind(typeName);

  const accountExpenses = expenses.filter((e) => e.accountId === account.id);
  const accountIncomes = incomes.filter((i) => i.accountId === account.id);
  const accountEntries = entriesForAccount(account.id, entries);

  const outgoingPayments = paymentsFromAccount(account.id, payments);
  const incomingPayments = paymentsToAccount(account.id, payments);
  const outgoingTransfers = transfersFromAccount(account.id, transfers);
  const incomingTransfers = transfersToAccount(account.id, transfers);
  const incomingBorrowings = borrowingsCreditedTo(
    account.id,
    liabilities?.borrowings ?? []
  );
  const outgoingRepayments = repaymentsPaidFrom(
    account.id,
    liabilities?.borrowingRepayments ?? []
  );
  const outgoingLends = receivablesPaidFrom(
    account.id,
    receivableFlows?.receivables ?? []
  );
  const incomingCollections = receivableRepaymentsInto(
    account.id,
    receivableFlows?.receivableRepayments ?? []
  );

  const activities: AccountActivity[] = [
    ...accountExpenses.map((e, idx) => ({
      id: e.id ?? `expense-${e.date}-${idx}`,
      date: e.date,
      time: resolveActivityClockTime(e.time, e.createdAt),
      amount: e.amount,
      type: "debit" as const,
      note: e.note,
      category: e.category,
      linkedExpenseId: e.id,
    })),
    ...accountIncomes.map((i, idx) => ({
      id: i.id ?? `income-${i.date}-${idx}`,
      date: i.date,
      time: resolveActivityClockTime(i.time, i.createdAt),
      amount: i.amount,
      type: "credit" as const,
      note: i.note,
      source: i.source,
      linkedIncomeId: i.id,
    })),
    ...accountEntries.map((entry) => ({
      id: `entry-${entry.id}`,
      date: entry.date,
      time: resolveActivityClockTime(undefined, entry.createdAt),
      amount: entry.amount,
      type: entry.direction,
      note:
        entry.note ||
        (entry.direction === "credit" ? "Manual funds added" : "Manual account debit"),
      linkedAccountEntryId: entry.id,
      isManualEntry: !entry.linkedSplitId,
    })),
    ...outgoingPayments.map((p) => ({
      id: p.id,
      date: p.date,
      time: resolveActivityClockTime(undefined, p.createdAt),
      amount: p.amount,
      type: "debit" as const,
      note: p.note || "Credit card bill payment",
      isBillPayment: true,
      linkedPaymentId: p.id,
      counterpartyName: getPaymentCounterpartyName(p, "outgoing", accountNameById),
    })),
    ...(kind === "credit"
      ? incomingPayments.map((p) => ({
          id: `payment-in-${p.id}`,
          date: p.date,
          time: resolveActivityClockTime(undefined, p.createdAt),
          amount: p.amount,
          type: "credit" as const,
          note: p.note || "Bill payment received",
          isBillPayment: true,
          linkedPaymentId: p.id,
          counterpartyName: getPaymentCounterpartyName(p, "incoming", accountNameById),
        }))
      : []),
    ...outgoingTransfers.map((transfer) => ({
      id: `transfer-out-${transfer.id}`,
      date: transfer.date,
      time: resolveActivityClockTime(undefined, transfer.createdAt),
      amount: transfer.amount,
      type: "debit" as const,
      note: transfer.note || "Transfer to account",
      linkedTransferId: transfer.id,
      isTransfer: true,
      counterpartyName: accountNameById?.[transfer.toAccountId] ?? "Account",
    })),
    ...incomingTransfers.map((transfer) => ({
      id: `transfer-in-${transfer.id}`,
      date: transfer.date,
      time: resolveActivityClockTime(undefined, transfer.createdAt),
      amount: transfer.amount,
      type: "credit" as const,
      note: transfer.note || "Transfer from account",
      linkedTransferId: transfer.id,
      isTransfer: true,
      counterpartyName: accountNameById?.[transfer.fromAccountId] ?? "Account",
    })),
    ...incomingBorrowings.map((borrowing, idx) => ({
      id: `borrowing-in-${borrowing.id ?? idx}`,
      date: borrowing.borrowedDate,
      time: resolveActivityClockTime(undefined, borrowing.createdAt),
      amount: borrowing.principalAmount,
      type: "credit" as const,
      note: borrowing.note || "Money borrowed",
      linkedBorrowingId: borrowing.id,
      isBorrowing: true,
      counterpartyName: borrowing.lenderName,
    })),
    ...outgoingRepayments.map((repayment, idx) => ({
      id: `repayment-out-${repayment.id ?? idx}`,
      date: repayment.date,
      time: resolveActivityClockTime(undefined, repayment.createdAt),
      amount: repayment.amount,
      type: "debit" as const,
      note: repayment.note || "Loan repayment",
      linkedRepaymentId: repayment.id,
      linkedBorrowingId: repayment.borrowingId,
      isLoanRepayment: true,
    })),
    ...outgoingLends.map((receivable, idx) => ({
      id: `receivable-out-${receivable.id ?? idx}`,
      date: receivable.lentDate,
      time: resolveActivityClockTime(undefined, receivable.createdAt),
      amount: receivable.originalAmount,
      type: "debit" as const,
      note: receivable.note || receivable.purpose || "Money lent",
      linkedReceivableId: receivable.id,
      isReceivable: true,
      counterpartyName: receivable.personName,
    })),
    ...incomingCollections.map((repayment, idx) => ({
      id: `receivable-repay-in-${repayment.id ?? idx}`,
      date: repayment.date,
      time: resolveActivityClockTime(undefined, repayment.createdAt),
      amount: repayment.amount,
      type: "credit" as const,
      note: repayment.note || "Receivable repayment",
      linkedReceivableRepaymentId: repayment.id,
      linkedReceivableId: repayment.receivableId,
      isReceivableRepayment: true,
    })),
  ];

  const chronological = [...activities].sort(compareActivitiesChronologically);

  if (kind !== "credit") {
    const opening = account.openingBalance ?? 0;
    let running = opening;
    for (const act of chronological) {
      if (act.type === "debit") running -= act.amount;
      else running += act.amount;
      running = roundMoney(running);
      act.runningBalance = running;
    }
  }

  return chronological.reverse();
}

export function previewBalanceAfterTransaction(
  account: Account,
  typeName: string,
  expenses: Expense[],
  incomes: Income[],
  transactionType: "expense" | "income",
  amount: number,
  payments: AccountPayment[] = [],
  entries: AccountEntry[] = [],
  transfers: AccountTransfer[] = [],
  excludeId?: string,
  borrowings: Borrowing[] = [],
  borrowingRepayments: BorrowingRepayment[] = [],
  receivables: Receivable[] = [],
  receivableRepayments: ReceivableRepayment[] = []
): number | null {
  const kind = getAccountKind(typeName);
  if (kind !== "credit") {
    const filteredExpenses = excludeId
      ? expenses.filter((e) => e.id !== excludeId)
      : expenses;
    const filteredIncomes = excludeId
      ? incomes.filter((i) => i.id !== excludeId)
      : incomes;
    let balance = computeBankBalance(
      account,
      filteredExpenses,
      filteredIncomes,
      payments,
      entries,
      transfers,
      borrowings,
      borrowingRepayments,
      receivables,
      receivableRepayments
    );
    if (transactionType === "expense") balance -= amount;
    else balance += amount;
    return roundMoney(balance);
  }
  if (kind === "credit" && transactionType === "expense" && account.billGenerationDay) {
    const { availableCredit } = computeCreditUsage(account, expenses, payments);
    return roundMoney(availableCredit - amount);
  }
  return null;
}

export function previewBalanceAfterBillPayment(
  fromAccount: Account,
  expenses: Expense[],
  incomes: Income[],
  payments: AccountPayment[],
  entries: AccountEntry[],
  transfers: AccountTransfer[] = [],
  amount: number
): number {
  return roundMoney(
    computeBankBalance(fromAccount, expenses, incomes, payments, entries, transfers) - amount
  );
}
