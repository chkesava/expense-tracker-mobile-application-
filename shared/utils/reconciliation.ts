import {
  borrowingsCreditedTo,
  computeBankBalance,
  computeOutstandingCredit,
  receivableRepaymentsInto,
  receivablesPaidFrom,
  repaymentsPaidFrom,
} from "./accountBalance";
import { getAccountKind } from "./accountKind";
import type { EpfSummary, DashboardPeriodSummary } from "../types/financialSummary";
import type { Account, Expense, Income, AccountPayment, AccountTransfer, AccountEntry } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { addCategoryDeltas, summaryMonthOf } from "./dashboardSummaryKeys";
import { epfPortfolioSummary } from "../features/epf/utils/portfolio";
import type { EpfEstablishment, EpfContribution, EpfTransfer, EpfInterestEntry, EpfReconciliation } from "../features/epf/types";

/** Ledger rows that can move one account, already scoped to it. */
export type AccountSources = {
  expenses: Expense[];
  incomes: Income[];
  payments: AccountPayment[];
  transfers: AccountTransfer[];
  entries: AccountEntry[];
  borrowings: Borrowing[];
  borrowingRepayments: BorrowingRepayment[];
  receivables: Receivable[];
  receivableRepayments: ReceivableRepayment[];
  bills: any[];
};

export type AccountRebuildPlan = {
  accountId: string;
  kind: "credit" | "bank";
  /** Fields a rebuild writes (the balance and both status fields). */
  set: Record<string, number | string>;
  /** Stored fields a rebuild deletes (stale derived card fields). */
  clear: string[];
  /** Human-readable differences, empty when the stored value is right. */
  variances: string[];
  /** True when anything must be written, including only clearing a flag. */
  needsWrite: boolean;
};

const flagged = (account: Record<string, unknown>) =>
  account.balanceReconciliationStatus === "needs_reconciliation" ||
  account.summaryReconciliationStatus === "needs_reconciliation";

/**
 * SPENDLY-499 — the single reference for what a rebuild writes to one
 * account. The in-app rebuild, both scripts and `recomputeFinancialState`
 * all call this, so they cannot diverge. Pure.
 *
 * - Card: `currentOutstanding` from the ledger (refunds, transfers and
 *   adjustments count; credit the ledger set aside is left alone — SPENDLY-497),
 *   stale derived fields cleared.
 * - Bank: `currentBalance` from `computeBankBalance`.
 * - Both status fields become `healthy`, and a flagged account whose value is
 *   already right is still written so the flag clears (it never did before).
 */
export function planAccountRebuild(
  account: Account,
  typeName: string,
  sources: AccountSources,
  today: string
): AccountRebuildPlan {
  const stored = account as unknown as Record<string, unknown>;
  const healthy = { balanceReconciliationStatus: "healthy", summaryReconciliationStatus: "healthy" };
  if (getAccountKind(typeName) === "credit") {
    const res = computeOutstandingCredit(account, sources.expenses, sources.payments, sources.bills, today, {
      incomes: sources.incomes,
      entries: sources.entries,
      transfers: sources.transfers,
    });
    const card = planCardRebuild(stored, res.totalOutstanding, res.unappliedCredit);
    return {
      accountId: account.id,
      kind: "credit",
      set: { currentOutstanding: card.currentOutstanding, ...healthy },
      clear: card.staleFields,
      variances: [
        ...card.variances,
        ...(card.staleFields.length ? [`stale derived fields to clear: ${card.staleFields.join(", ")}`] : []),
      ],
      needsWrite: card.needsWrite || flagged(stored),
    };
  }
  const balance = computeBankBalance(
    account,
    sources.expenses,
    sources.incomes,
    sources.payments,
    sources.entries,
    sources.transfers,
    sources.borrowings,
    sources.borrowingRepayments,
    sources.receivables,
    sources.receivableRepayments,
    today
  );
  const was = typeof stored.currentBalance === "number" ? stored.currentBalance : undefined;
  const variances = was === balance ? [] : [`currentBalance: ${was ?? "missing"} → ${balance}`];
  return {
    accountId: account.id,
    kind: "bank",
    set: { currentBalance: balance, ...healthy },
    clear: [],
    variances,
    needsWrite: variances.length > 0 || flagged(stored),
  };
}

/** The balance a rebuild would store for one account (kept for existing callers). */
export function calculateAccountBalances(
  inputs: AccountSources & { account: Account; typeName: string; today: string }
): Partial<Account> {
  const plan = planAccountRebuild(inputs.account, inputs.typeName, inputs, inputs.today);
  return plan.kind === "credit"
    ? { currentOutstanding: plan.set.currentOutstanding as number }
    : { currentBalance: plan.set.currentBalance as number };
}

/** Scopes a user's ledger to the rows that can move `accountId`. Pure. */
export function accountSourcesFor(
  accountId: string,
  rows: AccountSources
): AccountSources {
  return {
    expenses: rows.expenses.filter((e) => e.accountId === accountId),
    incomes: rows.incomes.filter((i) => i.accountId === accountId),
    payments: rows.payments.filter((p) => p.fromAccountId === accountId || p.toAccountId === accountId),
    transfers: rows.transfers.filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId),
    entries: rows.entries.filter((e) => e.accountId === accountId),
    // SPENDLY-436: each relates to an account through its own named field.
    borrowings: borrowingsCreditedTo(accountId, rows.borrowings),
    borrowingRepayments: repaymentsPaidFrom(accountId, rows.borrowingRepayments),
    receivables: receivablesPaidFrom(accountId, rows.receivables),
    receivableRepayments: receivableRepaymentsInto(accountId, rows.receivableRepayments),
    bills: rows.bills.filter((b: { accountId?: string }) => b.accountId === accountId),
  };
}

export type FinancialStateInput = AccountSources & {
  accounts: Account[];
  accountTypes: { id: string; name?: string }[];
  epfEstablishments: EpfEstablishment[];
  epfContributions: EpfContribution[];
  epfTransfers: EpfTransfer[];
  epfInterestEntries: EpfInterestEntry[];
  epfReconciliations: EpfReconciliation[];
};

/**
 * SPENDLY-499 — everything a full rebuild derives for one user, from source
 * rows only: per-account plans, the EPF summary and the dashboard periods.
 * Net worth is deliberately absent: `composeNetWorth` (computed live) is its
 * single definition; the stored netWorth/investments docs are retired. Pure.
 */
export function recomputeFinancialState(input: FinancialStateInput, today: string) {
  const typeNames = new Map(input.accountTypes.map((t) => [t.id, t.name ?? ""]));
  return {
    accounts: input.accounts.map((account) =>
      planAccountRebuild(account, typeNames.get(account.typeId) ?? "", accountSourcesFor(account.id, input), today)
    ),
    epf: calculateEpfSummary({
      establishments: input.epfEstablishments,
      contributions: input.epfContributions,
      transfers: input.epfTransfers,
      interestEntries: input.epfInterestEntries,
      adjustments: input.epfReconciliations,
    }),
    dashboards: calculateDashboardSummaries(input.expenses, input.incomes),
  };
}

export function calculateEpfSummary(inputs: {
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  interestEntries: EpfInterestEntry[];
  adjustments: EpfReconciliation[];
}): Partial<EpfSummary> {
  const summary = epfPortfolioSummary(inputs);
  return {
    currentBalance: summary.total,
    employeeContributionTotal: summary.employeeShare,
    employerContributionTotal: summary.employerEpfShare,
    interestTotal: summary.interest,
    adjustmentsTotal: summary.adjustments,
    lastCreditPeriod: summary.lastReconciledAt, 
  };
}

export function calculateDashboardSummaries(
  expenses: Expense[],
  incomes: Income[]
): Map<string, Partial<DashboardPeriodSummary>> {
  const periods = new Map<string, Partial<DashboardPeriodSummary>>();

  const initPeriod = (p: string) => {
    if (!periods.has(p)) {
      periods.set(p, {
        period: p,
        totalExpenses: 0,
        totalIncome: 0,
        categoryTotals: {},
        transactionCount: 0,
      });
    }
    return periods.get(p)!;
  };

  // SPENDLY-495: the same month rule (`month`, else the date prefix) and the
  // same parent + "parent::sub" keys the incremental writes use, so a rebuild
  // and the live increments land on identical documents.
  for (const e of expenses) {
    if (e.deletedAt) continue;
    const p = summaryMonthOf(e);
    if (!p) continue;
    const m = initPeriod(p);
    m.totalExpenses! += e.amount;
    m.transactionCount! += 1;
    addCategoryDeltas(m.categoryTotals!, e, e.amount);
  }

  for (const i of incomes) {
    if (i.deletedAt) continue;
    const p = summaryMonthOf(i);
    if (!p) continue;
    const m = initPeriod(p);
    m.totalIncome! += i.amount;
    m.transactionCount! += 1;
  }

  return periods;
}

/** Literal top-level fields like `"categoryTotals.Food"` left by the pre-495 writes. */
export function strayDottedCategoryFields(doc: Record<string, unknown>): string[] {
  return Object.keys(doc).filter((key) => key.startsWith("categoryTotals."));
}

const roundPaise = (n: number) => Math.round(n * 100) / 100;

export type DashboardRepairPlan = {
  period: string;
  /** Human-readable differences between the stored doc and the rebuild. */
  variances: string[];
  /** Literal dotted fields to delete. */
  strayFields: string[];
  /** The values the rebuild would write (all zero for a month with no rows). */
  next: Required<Pick<DashboardPeriodSummary, "period" | "totalExpenses" | "totalIncome" | "transactionCount" | "categoryTotals">>;
};

/**
 * SPENDLY-495 — compares stored `dashboard_{YYYY-MM}` docs with a rebuild and
 * lists what an apply would change. Pure; the rebuild script prints it in dry
 * run and writes `next` (replacing `categoryTotals` wholesale) on apply. A
 * stored month with no rows left is planned back to zero, not left stale.
 */
export function planDashboardSummaryRepair(
  existing: { id: string; data: Record<string, unknown> }[],
  recalculated: Map<string, Partial<DashboardPeriodSummary>>
): DashboardRepairPlan[] {
  const stored = new Map<string, Record<string, unknown>>();
  for (const { id, data } of existing) {
    if (id.startsWith("dashboard_")) stored.set(id.slice("dashboard_".length), data);
  }
  const periods = [...new Set([...stored.keys(), ...recalculated.keys()])].sort();

  return periods.map((period) => {
    const calc = recalculated.get(period);
    const next = {
      period,
      totalExpenses: roundPaise(calc?.totalExpenses ?? 0),
      totalIncome: roundPaise(calc?.totalIncome ?? 0),
      transactionCount: calc?.transactionCount ?? 0,
      categoryTotals: Object.fromEntries(
        Object.entries(calc?.categoryTotals ?? {}).map(([k, v]) => [k, roundPaise(v)])
      ),
    };
    const doc = stored.get(period) ?? {};
    const variances: string[] = [];
    if (!stored.has(period)) variances.push("missing summary doc");
    for (const field of ["totalExpenses", "totalIncome", "transactionCount"] as const) {
      const was = typeof doc[field] === "number" ? (doc[field] as number) : 0;
      if (roundPaise(was) !== next[field]) variances.push(`${field}: ${was} → ${next[field]}`);
    }
    const storedTotals =
      doc.categoryTotals && typeof doc.categoryTotals === "object"
        ? (doc.categoryTotals as Record<string, unknown>)
        : {};
    const keys = new Set([...Object.keys(storedTotals), ...Object.keys(next.categoryTotals)]);
    for (const key of [...keys].sort()) {
      const was = typeof storedTotals[key] === "number" ? (storedTotals[key] as number) : 0;
      const now = next.categoryTotals[key] ?? 0;
      if (roundPaise(was) !== now) variances.push(`categoryTotals[${key}]: ${was} → ${now}`);
    }
    return { period, variances, strayFields: strayDottedCategoryFields(doc), next };
  });
}



/**
 * SPENDLY-497 — card fields that used to be stored but cannot be kept current
 * by incremental writes (they change when a billing cycle closes, and nothing
 * writes at that moment). Screens now derive them live from the ledger; a
 * rebuild clears the stale stored copies.
 */
export const DERIVED_CARD_FIELDS = [
  "unbilledSpend",
  "statementDue",
  "availableCredit",
  "paidThisCycle",
  "cashbackThisCycle",
  "oldestOpenRemaining",
  "oldestOpenBillId",
  "openCycleStart",
] as const;

export type CardRebuildPlan = {
  currentOutstanding: number;
  /** "currentOutstanding: was → now" when the stored total is wrong. */
  variances: string[];
  /** Stored derived fields to delete. */
  staleFields: string[];
  /** True when anything must be written, including clearing the reconciliation flag. */
  needsWrite: boolean;
};

/**
 * What a card rebuild should write, from the stored doc and the recomputed
 * total. Pure.
 *
 * The ledger sets aside credit it cannot match to a statement it sees (the
 * user's 2026-10-20 decision keeps that safe rule). The stored total is a
 * running sum of every write, which does subtract that credit — so a stored
 * value of exactly `ledger total − unappliedCredit` is consistent and is left
 * alone rather than raised.
 */
export function planCardRebuild(
  account: Record<string, unknown>,
  recalculatedOutstanding: number,
  unappliedCredit = 0
): CardRebuildPlan {
  const stored = typeof account.currentOutstanding === "number" ? account.currentOutstanding : undefined;
  const netOfSetAside = roundPaise(recalculatedOutstanding - unappliedCredit);
  const consistent =
    stored === recalculatedOutstanding || (unappliedCredit > 0 && stored === netOfSetAside);
  const target = consistent && stored !== undefined ? stored : recalculatedOutstanding;
  const variances = consistent
    ? []
    : [`currentOutstanding: ${stored ?? "missing"} → ${recalculatedOutstanding}`];
  const staleFields = DERIVED_CARD_FIELDS.filter((field) => account[field] !== undefined);
  const flagged = account.summaryReconciliationStatus === "needs_reconciliation";
  return {
    currentOutstanding: target,
    variances,
    staleFields,
    needsWrite: variances.length > 0 || staleFields.length > 0 || flagged,
  };
}

/**
 * SPENDLY-499 — the exact field map a rebuild writes for one account plan.
 * The in-app rebuild passes the client SDK's `deleteField`/`serverTimestamp`,
 * the scripts pass the Admin SDK's, so every caller writes the same fields and
 * the same timestamp type. Pure.
 */
export function accountRebuildWrite<D, T>(
  plan: AccountRebuildPlan,
  sentinels: { remove: () => D; now: () => T }
): Record<string, number | string | D | T> {
  return {
    ...plan.set,
    ...Object.fromEntries(plan.clear.map((field) => [field, sentinels.remove()])),
    balanceLastRebuiltAt: sentinels.now(),
    lastReconciledAt: sentinels.now(),
  };
}
