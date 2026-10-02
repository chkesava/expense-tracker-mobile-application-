/**
 * Historical burn-rate analysis and baseline selection (SPENDLY-208).
 *
 * Turns recorded expenses and incomes into the monthly baseline the runway
 * engine (206) needs. Pure and single-pass; nothing is written.
 *
 * Rules (docs/SPENDLY-208-burn-baseline.md):
 * - Window: the last N complete calendar months before the current month.
 *   The current month is partial, so it is reported separately and never
 *   averaged.
 * - Months before the first recorded transaction are "before_history"; months
 *   after it with no transactions are "empty". Neither counts toward the
 *   average; both are listed.
 * - A single expense larger than twice the window's median monthly outflow is
 *   "unusual": listed and left out of the baseline unless included explicitly.
 * - Refunds, cashback and reimbursements reduce discretionary spending (never
 *   below zero); investment proceeds are ignored; money movement is never burn.
 * - Two baselines: `burnBaseline` (everything, for net/gross burn) and
 *   `projectionBaseline` (without expenses posted by recurring items that are
 *   still active — the projection adds those as scheduled events instead).
 */

import { BURN_CLASSES, type BurnClass, type RunwayAssumptionCode } from "../types/runway";
import type { Expense, Income } from "../types/expense";
import type { Subscription } from "../types/subscription";
import { isValidMonthKey, shiftMonthKey } from "./dates";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";
import { burnClassForExpense, incomeClassFor } from "./runwayContract";
import type { RunwayBaseline } from "./runwayEngine";

export type BaselineMethod = "average" | "median";
export const BASELINE_WINDOWS = [3, 6, 12] as const;
export type BaselineWindow = (typeof BASELINE_WINDOWS)[number];

/** One expense larger than this many median months of outflow is unusual. */
export const UNUSUAL_EXPENSE_MULTIPLE = 2;

export type BaselineMonthStatus = "included" | "empty" | "before_history";

type ClassTotals = Record<BurnClass, number>;

export interface RunwayBaselineMonth {
  month: string;
  status: BaselineMonthStatus;
  earnedIncome: number;
  refunds: number;
  outflowByClass: ClassTotals;
  /** Of `outflowByClass`, the part posted by still-active recurring items. */
  recurringByClass: ClassTotals;
  unusualExcluded: number;
  transactionCount: number;
}

export interface UnusualExpense {
  id: string;
  label: string;
  category: string;
  amount: number;
  date: string;
}

export interface RunwayBaselineResult {
  window: { months: number; from: string; to: string; method: BaselineMethod };
  /** The partial current month, actual figures so far — never averaged. */
  currentMonth: { month: string; earnedIncome: number; outflow: number; transactionCount: number };
  months: RunwayBaselineMonth[];
  monthsOfHistory: number;
  burnBaseline: RunwayBaseline | null;
  projectionBaseline: RunwayBaseline | null;
  unusual: UnusualExpense[];
  /** Window totals that reconcile to the source transactions. */
  reconciliation: {
    expenseTotal: number;
    countedOutflow: number;
    moneyMovement: number;
    unusualExcluded: number;
    earnedIncome: number;
    refunds: number;
    ignoredIncome: number;
  };
  assumptions: RunwayAssumptionCode[];
  unresolvedCategoryCount: number;
}

export interface RunwayBaselineInput {
  expenses: readonly Expense[];
  incomes: readonly Income[];
  subscriptions: readonly Subscription[];
  /** Local date key in the user's timezone. */
  today: string;
  windowMonths: number;
  method: BaselineMethod;
  /** Keep unusual expenses in the baseline. Default false. */
  includeUnusual?: boolean;
}

const zeroClasses = (): ClassTotals => Object.fromEntries(BURN_CLASSES.map((c) => [c, 0])) as ClassTotals;

function monthOf(row: { month?: string; date?: string }): string | null {
  if (row.month && isValidMonthKey(row.month)) return row.month;
  const m = row.date?.slice(0, 7);
  return m && isValidMonthKey(m) ? m : null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const outflowOf = (t: ClassTotals) => BURN_CLASSES.reduce((sum, c) => (c === "money_movement" ? sum : sum + t[c]), 0);

export function buildRunwayBaseline(input: RunwayBaselineInput): RunwayBaselineResult {
  const windowMonths = Math.min(Math.max(1, Math.round(input.windowMonths) || 6), 24);
  const currentMonth = input.today.slice(0, 7);
  const to = shiftMonthKey(currentMonth, -1);
  const from = shiftMonthKey(currentMonth, -windowMonths);
  const activeRecurring = new Set(
    input.subscriptions.filter((s) => s.id && s.isActive && !s.isCompleted && s.type !== "transfer").map((s) => s.id as string)
  );
  const assumptions = new Set<RunwayAssumptionCode>();
  let unresolvedCategoryCount = 0;

  const months = new Map<string, RunwayBaselineMonth>();
  const slot = (month: string) => {
    let m = months.get(month);
    if (!m) {
      m = { month, status: "included", earnedIncome: 0, refunds: 0, outflowByClass: zeroClasses(), recurringByClass: zeroClasses(), unusualExcluded: 0, transactionCount: 0 };
      months.set(month, m);
    }
    return m;
  };
  const current = { month: currentMonth, earnedIncome: 0, outflow: 0, transactionCount: 0 };
  let firstMonth: string | null = null;
  const windowExpenses: Array<{ e: Expense; month: string; cls: BurnClass }> = [];
  let ignoredIncome = 0;

  for (const e of input.expenses) {
    if (!isActiveLedgerRow(e) || !(e.amount > 0)) continue;
    const month = monthOf(e);
    if (!month) continue;
    if (!firstMonth || month < firstMonth) firstMonth = month;
    if (month === currentMonth) {
      const c = burnClassForExpense(e);
      if (c.burnClass !== "money_movement") current.outflow = roundMoney(current.outflow + e.amount);
      current.transactionCount++;
      continue;
    }
    if (month < from || month > to) continue;
    const c = burnClassForExpense(e);
    if (c.resolution === "unresolved") unresolvedCategoryCount++;
    if (c.resolution === "mapped") assumptions.add("category_mapped_from_legacy");
    windowExpenses.push({ e, month, cls: c.burnClass });
  }

  for (const inc of input.incomes) {
    if (!isActiveLedgerRow(inc) || !(inc.amount > 0)) continue;
    const month = monthOf(inc);
    if (!month) continue;
    if (!firstMonth || month < firstMonth) firstMonth = month;
    const { incomeClass, recognised } = incomeClassFor(inc);
    if (month === currentMonth) {
      if (incomeClass === "earned") current.earnedIncome = roundMoney(current.earnedIncome + inc.amount);
      current.transactionCount++;
      continue;
    }
    if (month < from || month > to) continue;
    if (!recognised) assumptions.add("income_source_unrecognised");
    const m = slot(month);
    m.transactionCount++;
    if (incomeClass === "earned") m.earnedIncome = roundMoney(m.earnedIncome + inc.amount);
    else if (incomeClass === "refund_offset") m.refunds = roundMoney(m.refunds + inc.amount);
    else ignoredIncome = roundMoney(ignoredIncome + inc.amount);
  }

  // First pass: monthly totals before outlier removal, to find the median month.
  const raw = new Map<string, number>();
  for (const { e, month, cls } of windowExpenses) {
    if (cls !== "money_movement") raw.set(month, (raw.get(month) ?? 0) + e.amount);
  }
  const medianMonth = median([...raw.values()]);
  const unusualLimit = medianMonth * UNUSUAL_EXPENSE_MULTIPLE;
  const unusual: UnusualExpense[] = [];

  let expenseTotal = 0;
  let moneyMovement = 0;
  let unusualExcluded = 0;
  for (const { e, month, cls } of windowExpenses) {
    const m = slot(month);
    m.transactionCount++;
    expenseTotal += e.amount;
    if (cls === "money_movement") {
      moneyMovement += e.amount;
      m.outflowByClass.money_movement = roundMoney(m.outflowByClass.money_movement + e.amount);
      continue;
    }
    // Needs at least two months for "unusual" to mean anything.
    if (raw.size >= 2 && unusualLimit > 0 && e.amount > unusualLimit) {
      unusual.push({ id: e.id ?? "", label: e.note || e.subcategory || e.category, category: e.category, amount: e.amount, date: e.date });
      if (!input.includeUnusual) {
        unusualExcluded += e.amount;
        m.unusualExcluded = roundMoney(m.unusualExcluded + e.amount);
        continue;
      }
    }
    m.outflowByClass[cls] = roundMoney(m.outflowByClass[cls] + e.amount);
    if (e.subscriptionId && activeRecurring.has(e.subscriptionId)) {
      m.recurringByClass[cls] = roundMoney(m.recurringByClass[cls] + e.amount);
    }
  }

  // Lay out every window month, marking empty and pre-history months.
  const ordered: RunwayBaselineMonth[] = [];
  for (let k = from; k <= to; k = shiftMonthKey(k, 1)) {
    const m = months.get(k) ?? slot(k);
    if (!firstMonth || k < firstMonth) m.status = "before_history";
    else if (m.transactionCount === 0) m.status = "empty";
    ordered.push(m);
  }
  const included = ordered.filter((m) => m.status === "included");
  const monthsOfHistory = included.length;
  if (monthsOfHistory === 0) assumptions.add("no_history");
  else if (monthsOfHistory < 3) assumptions.add("short_history");
  if (unresolvedCategoryCount > 0) assumptions.add("category_unresolved");
  if (input.subscriptions.some((s) => s.isActive && !s.isCompleted && s.source === "sms")) assumptions.add("uncertain_commitments");

  const pick = (values: number[]) =>
    roundMoney(input.method === "median" ? median(values) : values.reduce((a, b) => a + b, 0) / values.length);

  const baselineFrom = (withoutRecurring: boolean): RunwayBaseline | null => {
    if (!monthsOfHistory) return null;
    const monthlyOutflowByClass: Partial<Record<BurnClass, number>> = {};
    for (const c of BURN_CLASSES) {
      if (c === "money_movement") continue;
      const series = included.map((m) => {
        let v = m.outflowByClass[c] - (withoutRecurring ? m.recurringByClass[c] : 0);
        // Refunds offset discretionary spending, never below zero.
        if (c === "discretionary") v = Math.max(0, v - m.refunds);
        return v;
      });
      monthlyOutflowByClass[c] = pick(series);
    }
    return { monthlyEarnedIncome: pick(included.map((m) => m.earnedIncome)), monthlyOutflowByClass };
  };

  const countedOutflow = roundMoney(included.reduce((t, m) => t + outflowOf(m.outflowByClass), 0));

  return {
    window: { months: windowMonths, from, to, method: input.method },
    currentMonth: current,
    months: ordered,
    monthsOfHistory,
    burnBaseline: baselineFrom(false),
    projectionBaseline: baselineFrom(true),
    unusual: unusual.sort((a, b) => b.amount - a.amount),
    reconciliation: {
      expenseTotal: roundMoney(expenseTotal),
      countedOutflow,
      moneyMovement: roundMoney(moneyMovement),
      unusualExcluded: roundMoney(unusualExcluded),
      earnedIncome: roundMoney(included.reduce((t, m) => t + m.earnedIncome, 0)),
      refunds: roundMoney(included.reduce((t, m) => t + m.refunds, 0)),
      ignoredIncome,
    },
    assumptions: [...assumptions],
    unresolvedCategoryCount,
  };
}
