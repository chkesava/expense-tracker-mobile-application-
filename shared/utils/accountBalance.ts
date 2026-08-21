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
  isDateKeyInInclusiveRange,
  normalizeBillGenerationDay,
} from "./billingCycle";
import {
  buildCreditCardLedger,
  oldestOpenStatement,
  type LedgerBillSlice,
} from "./creditCardLedger";
import { parseLocalDate, todayDateKey, toLocalDateKey } from "./dates";
import { roundMoney } from "./money";

export { toLocalDateKey } from "./dates";
export { roundMoney } from "./money";

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

/**
 * Spend in the still-open (unbilled) window. This is the number that resets to
 * zero the moment a statement is cut — it never includes an earlier statement,
 * and a payment toward an earlier statement never reduces it.
 */
export function computeCreditUsage(
  account: Account,
  expenses: Expense[],
  payments: AccountPayment[] = [],
  today: string = todayDateKey()
): {
  usedThisCycle: number;
  availableCredit: number;
  nextResetDate: Date;
  daysRemaining: number;
  paidThisCycle: number;
} {
  const billDay = normalizeBillGenerationDay(account.billGenerationDay) ?? 1;
  const asOf = parseLocalDate(today);
  const { previousBillDate, nextBillDate } = getBillingCycleDates(billDay, asOf);
  const cycleStart = parseLocalDate(
    toLocalDateKey(previousBillDate)
  );
  cycleStart.setDate(cycleStart.getDate() + 1);

  const usedThisCycle = roundMoney(
    expenses
      .filter(
        (e) =>
          e.accountId === account.id &&
          isDateKeyInInclusiveRange(e.date, cycleStart, nextBillDate)
      )
      .reduce((sum, e) => sum + e.amount, 0)
  );
  const paidThisCycle = roundMoney(
    payments
      .filter(
        (p) =>
          p.toAccountId === account.id &&
          isDateKeyInInclusiveRange(p.date, cycleStart, nextBillDate)
      )
      .reduce((sum, p) => sum + p.amount, 0)
  );
  const limit = account.creditLimit ?? 0;

  return {
    usedThisCycle,
    availableCredit: roundMoney(Math.max(0, limit - usedThisCycle)),
    nextResetDate: nextBillDate,
    daysRemaining: getDaysUntilReset(nextBillDate, asOf),
    paidThisCycle,
  };
}

/** Fields needed to keep an unpaid statement in card used / liabilities. */
export type OpenCreditBillSlice = LedgerBillSlice;

/**
 * What is still owed on a card. Thin wrapper over {@link buildCreditCardLedger}:
 * `usedThisCycle` is unbilled spend only, `statementDue` is what closed
 * statements still owe, and `outstanding` is the sum of the two.
 */
export function computeOutstandingCredit(
  account: Account,
  expenses: Expense[],
  payments: AccountPayment[] = [],
  bills: OpenCreditBillSlice[] = [],
  today: string = todayDateKey()
): {
  unpaidBills: number;
  statementDue: number;
  unbilledSpend: number;
  outstanding: number;
  totalOutstanding: number;
  availableCredit: number;
  usedThisCycle: number;
  paidThisCycle: number;
  unappliedCredit: number;
  oldestOpenRemaining: number;
  oldestOpenBillId?: string;
  nextResetDate: Date;
  daysRemaining: number;
} {
  const ledger = buildCreditCardLedger({
    account,
    expenses,
    payments,
    bills,
    today,
  });
  const oldest = oldestOpenStatement(ledger);
  const paidThisCycle = roundMoney(
    payments
      .filter(
        (payment) =>
          payment.toAccountId === account.id &&
          payment.date >= ledger.openCycle.start &&
          payment.date <= ledger.openCycle.end
      )
      .reduce((sum, payment) => sum + payment.amount, 0)
  );

  return {
    unpaidBills: ledger.statementDue,
    statementDue: ledger.statementDue,
    unbilledSpend: ledger.unbilledSpend,
    outstanding: ledger.totalOutstanding,
    totalOutstanding: ledger.totalOutstanding,
    availableCredit: ledger.availableCredit,
    usedThisCycle: ledger.unbilledSpend,
    paidThisCycle,
    unappliedCredit: ledger.unappliedCredit,
    oldestOpenRemaining: oldest?.remaining ?? 0,
    oldestOpenBillId: oldest?.billId,
    nextResetDate: parseLocalDate(ledger.openCycle.end),
    daysRemaining: ledger.openCycle.daysRemaining,
  };
}

export type CreditBillStatus = "unpaid" | "partiallyPaid" | "paid" | "cancelled";

export interface CreditBillSummary {
  id: string;
  accountId: string;
  billId?: string;
  cycleStart: Date;
  cycleEnd: Date;
  statementDate: string;
  dueDate: string;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: CreditBillStatus;
  /** True when a stored statement document backs this cycle. */
  hasStatement: boolean;
}

/**
 * Closed statement history, newest first, derived from the same ledger the
 * hero uses — so a cycle can never show more paid than billed and a payment
 * can never appear in two cycles.
 */
export function getCreditBillHistory(
  account: Account,
  expenses: Expense[],
  payments: AccountPayment[] = [],
  cycles = 6,
  bills: OpenCreditBillSlice[] = [],
  today: string = todayDateKey()
): CreditBillSummary[] {
  const ledger = buildCreditCardLedger({
    account,
    expenses,
    payments,
    bills,
    today,
    cycles,
  });

  return ledger.statements
    .filter(
      (statement) =>
        statement.billed > 0 || statement.paid > 0 || Boolean(statement.billId)
    )
    .slice(0, cycles)
    .map((statement) => ({
      id: statement.billId || `${account.id}-${statement.statementDate}`,
      accountId: account.id,
      billId: statement.billId,
      cycleStart: parseLocalDate(statement.periodStart),
      cycleEnd: parseLocalDate(statement.periodEnd),
      statementDate: statement.statementDate,
      dueDate: statement.dueDate,
      billedAmount: statement.billed,
      paidAmount: statement.paid,
      outstandingAmount: statement.remaining,
      status: statement.status,
      hasStatement: Boolean(statement.billId),
    }));
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
  receivableRepayments: ReceivableRepayment[] = [],
  bills: OpenCreditBillSlice[] = [],
  today: string = todayDateKey()
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
    const { availableCredit } = computeOutstandingCredit(
      account,
      expenses,
      payments,
      bills,
      today
    );
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
