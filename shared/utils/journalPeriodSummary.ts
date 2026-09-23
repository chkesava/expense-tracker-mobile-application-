/**
 * SPENDLY-111 — daily / weekly / monthly intelligence over the Journal.
 *
 * ## Why these totals cannot double-count
 *
 * The Journal's row set is exactly one record per `Expense` and one per
 * `Income` (SPENDLY-109). Transfers, credit-card bill payments and cashback
 * are `AccountTransfer` / `AccountPayment` rows and are *not* in it, so they
 * cannot inflate income or spending here — the guarantee is structural rather
 * than a filter that could be forgotten. `journalActivities.ts` explains why
 * the row set is built that way.
 *
 * The one flow that *is* present and needs care is credit-card spending: a
 * card purchase is an ordinary `Expense` pointing at the card. It is real
 * spending, so it counts in `spent`, but it is not cash leaving a bank — so it
 * is also reported separately as `cardSpent`, and the cash figures exclude it.
 * Adding a bill payment to the Journal later would double-count it against
 * this; that is the trap this file's shape is designed to make obvious.
 */

import {
  endOfWeekDateKey,
  monthFromDateKey,
  startOfWeekDateKey,
  type FirstDayOfWeek,
} from "./dates";
import { daysInMonth } from "./dates";
import { journalCashImpact } from "./journalRunningBalance";
import type { JournalRecord } from "./journalActivities";
import { roundMoney } from "./money";

export type JournalPeriodGranularity = "day" | "week" | "month";

export interface JournalTotals {
  transactionCount: number;
  /** Every expense row, card purchases included — real spending. */
  spent: number;
  /** The part of `spent` that went on a credit card, so it is visibly not cash. */
  cardSpent: number;
  income: number;
  /** `income - spent`. The headline performance figure. */
  net: number;
  /** Cash actually received (income on non-card accounts). */
  cashIn: number;
  /** Cash actually paid out (expenses on non-card accounts). */
  cashOut: number;
  /** `cashIn - cashOut`. Ties to the running cash-flow line row for row. */
  netCash: number;
}

export interface JournalPeriodSummary extends JournalTotals {
  /** `YYYY-MM-DD` for a day or week (week = its first day), `YYYY-MM` for a month. */
  key: string;
  granularity: JournalPeriodGranularity;
  /** Inclusive bounds of the bucket. */
  fromDate: string;
  toDate: string;
}

export function emptyJournalTotals(): JournalTotals {
  return {
    transactionCount: 0,
    spent: 0,
    cardSpent: 0,
    income: 0,
    net: 0,
    cashIn: 0,
    cashOut: 0,
    netCash: 0,
  };
}

/** Raw accumulator, rounded only when a figure is emitted. */
interface Accumulator {
  transactionCount: number;
  spent: number;
  cardSpent: number;
  income: number;
  cashIn: number;
  cashOut: number;
}

function accumulate(into: Accumulator, record: JournalRecord): void {
  const { amount, type } = record.activity;
  const impact = journalCashImpact(record);

  into.transactionCount += 1;
  if (type === "debit") {
    into.spent += amount;
    if (record.accountKind === "credit") into.cardSpent += amount;
  } else {
    into.income += amount;
  }

  if (impact.cash < 0) into.cashOut += -impact.cash;
  else if (impact.cash > 0) into.cashIn += impact.cash;
}

function seal(acc: Accumulator): JournalTotals {
  const spent = roundMoney(acc.spent);
  const income = roundMoney(acc.income);
  const cashIn = roundMoney(acc.cashIn);
  const cashOut = roundMoney(acc.cashOut);
  return {
    transactionCount: acc.transactionCount,
    spent,
    cardSpent: roundMoney(acc.cardSpent),
    income,
    net: roundMoney(income - spent),
    cashIn,
    cashOut,
    netCash: roundMoney(cashIn - cashOut),
  };
}

function newAccumulator(): Accumulator {
  return {
    transactionCount: 0,
    spent: 0,
    cardSpent: 0,
    income: 0,
    cashIn: 0,
    cashOut: 0,
  };
}

/** Totals across every supplied row, with no bucketing. */
export function summarizeJournalTotals(records: JournalRecord[]): JournalTotals {
  const acc = newAccumulator();
  for (const record of records) accumulate(acc, record);
  return seal(acc);
}

function bucketKey(
  dateKey: string,
  granularity: JournalPeriodGranularity,
  firstDayOfWeek: FirstDayOfWeek
): string {
  if (granularity === "month") return monthFromDateKey(dateKey);
  if (granularity === "week") return startOfWeekDateKey(dateKey, firstDayOfWeek);
  return dateKey;
}

function bucketBounds(
  key: string,
  granularity: JournalPeriodGranularity,
  firstDayOfWeek: FirstDayOfWeek
): { fromDate: string; toDate: string } {
  if (granularity === "month") {
    const [year, month] = key.split("-");
    const last = daysInMonth(Number(year), Number(month) - 1);
    return {
      fromDate: `${key}-01`,
      toDate: `${key}-${String(last).padStart(2, "0")}`,
    };
  }
  if (granularity === "week") {
    return { fromDate: key, toDate: endOfWeekDateKey(key, firstDayOfWeek) };
  }
  return { fromDate: key, toDate: key };
}

/**
 * Bucket rows by day, week or month. Buckets are returned **newest first**,
 * matching the order the Journal lists transactions in, and only buckets that
 * actually contain rows are emitted — an empty week is not invented.
 *
 * Rows carrying no usable date are skipped rather than collected under a
 * placeholder key, so a malformed row can never distort a period total.
 */
export function summarizeJournalPeriods(
  records: JournalRecord[],
  granularity: JournalPeriodGranularity,
  options?: { firstDayOfWeek?: FirstDayOfWeek }
): JournalPeriodSummary[] {
  const firstDayOfWeek = options?.firstDayOfWeek ?? "monday";
  const buckets = new Map<string, Accumulator>();

  for (const record of records) {
    const date = record.activity.date;
    if (!date) continue;
    const key = bucketKey(date, granularity, firstDayOfWeek);
    let acc = buckets.get(key);
    if (!acc) {
      acc = newAccumulator();
      buckets.set(key, acc);
    }
    accumulate(acc, record);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, acc]) => ({
      key,
      granularity,
      ...bucketBounds(key, granularity, firstDayOfWeek),
      ...seal(acc),
    }));
}
