/**
 * SPENDLY-104 — card-level analytics workspace.
 * All liability / billed / unbilled / available-credit figures come from
 * `buildCreditCardLedger`. This module only projects trends, period slices,
 * and category/merchant summaries — never a second set of totals.
 */

import type { Account, AccountPayment, Expense } from "../types/expense";
import { isCashbackPayment } from "../types/expense";
import { groupByCategory } from "./analytics";
import {
  buildCreditCardLedger,
  type CreditCardLedger,
  type LedgerBillSlice,
  type LedgerStatement,
} from "./creditCardLedger";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";
import { getTopVendors } from "./rangeAnalytics";
import { todayDateKey } from "./dates";

/** Inclusive YYYY-MM-DD window compare (calendar keys sort lexicographically). */
function isDateKeyInInclusiveRange(
  dateKey: string,
  start: string,
  end: string
): boolean {
  return dateKey >= start && dateKey <= end;
}

export type CardAnalyticsPeriodMode = "billing_cycles" | "calendar_months";

export type CardAnalyticsCompleteness = {
  /** Authoritative analytics are safe to show. */
  ready: boolean;
  reason: "incomplete_ledger" | "no_history" | null;
  message: string | null;
};

export type CardCycleAnalyticsPoint = {
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  billed: number;
  paid: number;
  remaining: number;
  /** User money applied to this statement (excludes cashback). */
  userPaid: number;
  cashbackApplied: number;
  /** Card expenses posted inside the cycle window. */
  spendInCycle: number;
  /** Closed: billed/limit. Open: unbilled/limit. Null when no limit. */
  utilizationPct: number | null;
  isOpen: boolean;
  billId?: string;
};

export type CardMonthlySpendPoint = {
  month: string;
  spend: number;
};

export type CardCycleComparison = {
  current: CardCycleAnalyticsPoint;
  previous: CardCycleAnalyticsPoint;
  billedDelta: number;
  spendDelta: number;
  cashbackDelta: number;
  remainingDelta: number;
};

export type CardAnalyticsWorkspace = {
  completeness: CardAnalyticsCompleteness;
  creditLimit: number;
  snapshot: {
    unbilledSpend: number;
    statementDue: number;
    totalOutstanding: number;
    availableCredit: number;
    utilizationPct: number | null;
    cashbackThisCycle: number;
  };
  cycles: CardCycleAnalyticsPoint[];
  monthlySpend: CardMonthlySpendPoint[];
  cycleComparison: CardCycleComparison | null;
  categorySummary: { category: string; value: number }[];
  merchantSummary: { note: string; count: number; total: number }[];
  /** Inclusive bounds used for category/merchant drill-down. */
  focusPeriod: { start: string; end: string; label: string };
};

export type BuildCardAnalyticsInput = {
  account: Account;
  expenses: Expense[];
  payments: AccountPayment[];
  bills?: LedgerBillSlice[];
  today?: string;
  /** SPENDLY-97/104: false while the expense list is still staged. */
  expensesComplete: boolean;
  mode?: CardAnalyticsPeriodMode;
  /** How many closed+open cycles (or calendar months) to project. */
  lookback?: number;
};

function utilizationPct(amount: number, limit: number): number | null {
  if (limit <= 0) return null;
  return Math.min(100, roundMoney((amount / limit) * 100));
}

function cardExpensesFor(
  accountId: string,
  expenses: Expense[]
): Expense[] {
  return expenses.filter(
    (expense) =>
      isActiveLedgerRow(expense) && expense.accountId === accountId
  );
}

function spendInWindow(
  expenses: Expense[],
  start: string,
  end: string
): number {
  return roundMoney(
    expenses
      .filter((expense) =>
        isDateKeyInInclusiveRange(expense.date, start, end)
      )
      .reduce((sum, expense) => sum + expense.amount, 0)
  );
}

function cashbackByPaymentId(
  payments: AccountPayment[]
): Map<string, number> {
  return new Map(
    payments
      .filter((payment) => isCashbackPayment(payment) && !payment.voidedAt)
      .map((payment) => [payment.id!, payment.amount])
  );
}

function statementCashback(
  statement: LedgerStatement,
  cashbackAmountById: Map<string, number>
): number {
  return roundMoney(
    Math.min(
      statement.paid,
      statement.paymentIds.reduce(
        (sum, id) => sum + (cashbackAmountById.get(id) ?? 0),
        0
      )
    )
  );
}

function buildCyclePoints(input: {
  ledger: CreditCardLedger;
  cardExpenses: Expense[];
  payments: AccountPayment[];
  lookback: number;
}): CardCycleAnalyticsPoint[] {
  const { ledger, cardExpenses, payments, lookback } = input;
  const cashbackAmountById = cashbackByPaymentId(payments);
  const limit = ledger.creditLimit;

  const closedOrOpen = ledger.statements.filter(
    (statement) =>
      statement.billed > 0 ||
      statement.paid > 0 ||
      Boolean(statement.billId) ||
      statement.isOpen
  );

  const points: CardCycleAnalyticsPoint[] = closedOrOpen
    .slice(0, lookback)
    .map((statement) => {
      const cashbackApplied = statementCashback(
        statement,
        cashbackAmountById
      );
      const userPaid = roundMoney(
        Math.max(0, statement.paid - cashbackApplied)
      );
      const spendInCycle = spendInWindow(
        cardExpenses,
        statement.periodStart,
        statement.periodEnd
      );
      return {
        statementDate: statement.statementDate,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        billed: statement.billed,
        paid: statement.paid,
        remaining: statement.remaining,
        userPaid,
        cashbackApplied,
        spendInCycle,
        utilizationPct: utilizationPct(statement.billed, limit),
        isOpen: statement.isOpen,
        billId: statement.billId,
      };
    });

  // Open cycle may not appear as a statement yet — surface unbilled as the tip.
  const openAlreadyListed = points.some(
    (point) =>
      point.periodStart === ledger.openCycle.start &&
      point.periodEnd === ledger.openCycle.end
  );
  if (!openAlreadyListed && ledger.openCycle.spend > 0) {
    points.unshift({
      statementDate: ledger.openCycle.end,
      periodStart: ledger.openCycle.start,
      periodEnd: ledger.openCycle.end,
      billed: 0,
      paid: 0,
      remaining: ledger.unbilledSpend,
      userPaid: 0,
      cashbackApplied: 0,
      spendInCycle: ledger.openCycle.spend,
      utilizationPct: utilizationPct(ledger.unbilledSpend, limit),
      isOpen: true,
    });
  }

  return points.slice(0, lookback);
}

function buildMonthlySpend(
  cardExpenses: Expense[],
  lookback: number,
  today: string
): CardMonthlySpendPoint[] {
  const totals = new Map<string, number>();
  for (const expense of cardExpenses) {
    const month = expense.month || expense.date.slice(0, 7);
    if (!month || month > today.slice(0, 7)) continue;
    totals.set(month, roundMoney((totals.get(month) ?? 0) + expense.amount));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, lookback)
    .map(([month, spend]) => ({ month, spend }))
    .reverse();
}

function compareCycles(
  cycles: CardCycleAnalyticsPoint[]
): CardCycleComparison | null {
  if (cycles.length < 2) return null;
  // Newest first: index 0 is current (often open), index 1 is previous closed.
  const current = cycles[0]!;
  const previous = cycles[1]!;
  return {
    current,
    previous,
    billedDelta: roundMoney(current.billed - previous.billed),
    spendDelta: roundMoney(current.spendInCycle - previous.spendInCycle),
    cashbackDelta: roundMoney(
      current.cashbackApplied - previous.cashbackApplied
    ),
    remainingDelta: roundMoney(current.remaining - previous.remaining),
  };
}

function focusFromMode(input: {
  mode: CardAnalyticsPeriodMode;
  cycles: CardCycleAnalyticsPoint[];
  monthlySpend: CardMonthlySpendPoint[];
  ledger: CreditCardLedger;
  today: string;
}): { start: string; end: string; label: string } {
  if (input.mode === "calendar_months" && input.monthlySpend.length) {
    const newest = input.monthlySpend[input.monthlySpend.length - 1]!;
    const oldest = input.monthlySpend[0]!;
    return {
      start: `${oldest.month}-01`,
      end: input.today,
      label: `${oldest.month} → ${newest.month}`,
    };
  }
  if (input.cycles.length) {
    const newest = input.cycles[0]!;
    const oldest = input.cycles[input.cycles.length - 1]!;
    return {
      start: oldest.periodStart,
      end: newest.periodEnd,
      label: `${oldest.periodStart} → ${newest.periodEnd}`,
    };
  }
  return {
    start: input.ledger.openCycle.start,
    end: input.today,
    label: "Open cycle",
  };
}

export function assessCardAnalyticsCompleteness(input: {
  expensesComplete: boolean;
  hasHistory: boolean;
}): CardAnalyticsCompleteness {
  if (!input.expensesComplete) {
    return {
      ready: false,
      reason: "incomplete_ledger",
      message:
        "Expense history is still loading. Analytics stay hidden until the full ledger is available so totals cannot drift.",
    };
  }
  if (!input.hasHistory) {
    return {
      ready: true,
      reason: "no_history",
      message:
        "No billed cycles or card spend yet. Analytics will appear after this card has activity.",
    };
  }
  return { ready: true, reason: null, message: null };
}

/**
 * Build the card analytics workspace from the canonical ledger.
 * When `expensesComplete` is false, snapshot fields are still returned for
 * layout but `completeness.ready` is false — UI must not treat them as final.
 */
export function buildCardAnalyticsWorkspace(
  input: BuildCardAnalyticsInput
): CardAnalyticsWorkspace {
  const today = input.today || todayDateKey();
  const lookback = Math.max(1, input.lookback ?? 6);
  const mode = input.mode ?? "billing_cycles";

  const ledger = buildCreditCardLedger({
    account: input.account,
    expenses: input.expenses,
    payments: input.payments,
    bills: input.bills,
    today,
    cycles: Math.max(lookback, 6),
  });

  const cardExpenses = cardExpensesFor(input.account.id, input.expenses);
  const cycles = buildCyclePoints({
    ledger,
    cardExpenses,
    payments: input.payments,
    lookback,
  });
  const monthlySpend = buildMonthlySpend(cardExpenses, lookback, today);
  const hasHistory =
    cycles.some(
      (cycle) =>
        cycle.billed > 0 ||
        cycle.spendInCycle > 0 ||
        cycle.paid > 0 ||
        cycle.cashbackApplied > 0
    ) || monthlySpend.some((point) => point.spend > 0);

  const completeness = assessCardAnalyticsCompleteness({
    expensesComplete: input.expensesComplete,
    hasHistory,
  });

  const focusPeriod = focusFromMode({
    mode,
    cycles,
    monthlySpend,
    ledger,
    today,
  });

  const focusExpenses = cardExpenses.filter((expense) =>
    isDateKeyInInclusiveRange(
      expense.date,
      focusPeriod.start,
      focusPeriod.end
    )
  );

  const cashbackThisCycle = roundMoney(
    input.payments
      .filter(
        (payment) =>
          payment.toAccountId === input.account.id &&
          !payment.voidedAt &&
          isCashbackPayment(payment) &&
          isDateKeyInInclusiveRange(
            payment.date,
            ledger.openCycle.start,
            today
          )
      )
      .reduce((sum, payment) => sum + payment.amount, 0)
  );

  return {
    completeness,
    creditLimit: ledger.creditLimit,
    snapshot: {
      unbilledSpend: ledger.unbilledSpend,
      statementDue: ledger.statementDue,
      totalOutstanding: ledger.totalOutstanding,
      availableCredit: ledger.availableCredit,
      utilizationPct: utilizationPct(
        ledger.unbilledSpend,
        ledger.creditLimit
      ),
      cashbackThisCycle,
    },
    cycles,
    monthlySpend,
    cycleComparison: compareCycles(cycles),
    categorySummary: groupByCategory(focusExpenses).sort(
      (a, b) => b.value - a.value
    ),
    merchantSummary: getTopVendors(focusExpenses),
    focusPeriod,
  };
}

/** Expenses in the analytics focus window — used for drill-down lists. */
export function cardAnalyticsFocusExpenses(
  workspace: CardAnalyticsWorkspace,
  accountId: string,
  expenses: Expense[]
): Expense[] {
  return cardExpensesFor(accountId, expenses).filter((expense) =>
    isDateKeyInInclusiveRange(
      expense.date,
      workspace.focusPeriod.start,
      workspace.focusPeriod.end
    )
  );
}
