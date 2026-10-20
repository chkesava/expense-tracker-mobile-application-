import { computeBankBalance, computeOutstandingCredit } from "./accountBalance";
import { getAccountKind } from "./accountKind";
import type { NetWorthSummary, EpfSummary, DashboardPeriodSummary } from "../types/financialSummary";
import type { Account, Expense, Income, AccountPayment, AccountTransfer, AccountEntry } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { composeNetWorth } from "./netWorth";
import { addCategoryDeltas, summaryMonthOf } from "./dashboardSummaryKeys";
import { epfPortfolioSummary } from "../features/epf/utils/portfolio";
import type { EpfEstablishment, EpfContribution, EpfTransfer, EpfInterestEntry, EpfReconciliation } from "../features/epf/types";

export function calculateAccountBalances(inputs: {
  account: Account;
  typeName: string;
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
  today: string;
}): Partial<Account> {
  const kind = getAccountKind(inputs.typeName);
  if (kind === "credit") {
    // SPENDLY-497: only the total is stored; the cycle split is derived on
    // read. Refunds, transfers and adjustments count, as the write path does.
    const res = computeOutstandingCredit(
      inputs.account,
      inputs.expenses,
      inputs.payments,
      inputs.bills,
      inputs.today,
      { incomes: inputs.incomes, entries: inputs.entries, transfers: inputs.transfers }
    );
    // Leaves a stored total that differs only by credit the ledger set aside.
    return {
      currentOutstanding: planCardRebuild(
        inputs.account as unknown as Record<string, unknown>,
        res.totalOutstanding,
        res.unappliedCredit
      ).currentOutstanding,
    };
  } else {
    const bal = computeBankBalance(
      inputs.account,
      inputs.expenses,
      inputs.incomes,
      inputs.payments,
      inputs.entries,
      inputs.transfers,
      inputs.borrowings,
      inputs.borrowingRepayments,
      inputs.receivables,
      inputs.receivableRepayments,
      inputs.today
    );
    return {
      currentBalance: bal,
    };
  }
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

export function calculateNetWorthSummary(inputs: Parameters<typeof composeNetWorth>[0]): Partial<NetWorthSummary> {
  const nw = composeNetWorth(inputs);
  return {
    netWorth: nw.totalNetWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    bankCashTotal: nw.liquidBankAssets,
    investmentCash: nw.stocksCashBalance,
    epfValue: nw.epfValue,
    creditCardLiabilities: nw.creditCardLiabilities,
    bankOverdraftLiabilities: nw.bankOverdraftLiabilities,
    borrowingLiabilities: nw.borrowingLiabilities,
    receivableAssets: nw.receivableAssets,
  };
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
