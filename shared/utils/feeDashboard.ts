/**
 * SPENDLY-316 — Fee & Charges dashboard aggregates.
 *
 * Every figure here is `feeComponentTotals` (shared/utils/feeModel.ts) over a
 * subset of the resolved fee records, so the hero, the trend and every
 * breakdown reconcile with each other and with the canonical records by
 * construction — there is no second set of sums. Principal is never read.
 *
 * Attribution: GST-on-fee, reversals and refunds that link to a fee are
 * grouped under *that fee's* type, account and provider, so a reversal
 * reduces the family it gave back. Every record is bucketed by its own date
 * (a reversal lands in the month the money came back).
 */

import type { FeeRecord, FeeTypeId } from "../types/fee";
import { shiftMonthKey } from "./dates";
import {
  countsTowardFeeTotals,
  feeComponentTotals,
  feeReviewDocId,
  needsFeeReview,
  type FeeComponentTotals,
} from "./feeModel";
import { roundMoney } from "./money";

export type FeePeriod = "this_month" | "last_3_months" | "this_year" | "last_12_months" | "all";

export const FEE_PERIODS: ReadonlyArray<{ id: FeePeriod; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_3_months", label: "3 months" },
  { id: "this_year", label: "This year" },
  { id: "last_12_months", label: "12 months" },
  { id: "all", label: "All time" },
];

export interface FeeDashboardFilters {
  period: FeePeriod;
  accountIds: string[];
  feeTypes: FeeTypeId[];
  /** Provider (institution) names; "source" in the SPENDLY-316 filter list. */
  providers: string[];
}

export const EMPTY_FEE_DASHBOARD_FILTERS: FeeDashboardFilters = {
  period: "this_month",
  accountIds: [],
  feeTypes: [],
  providers: [],
};

/** Label used when a record's institution is not known. */
export const UNKNOWN_PROVIDER = "Not specified";

export interface AttributedFee {
  record: FeeRecord;
  feeType?: FeeTypeId;
  accountId?: string;
  provider: string;
  month: string;
}

/**
 * Counted records with the type/account/provider they roll up under.
 * Uncertain and not-a-fee records never reach an aggregate.
 */
export function attributeFeeRecords(records: readonly FeeRecord[]): AttributedFee[] {
  const byKey = new Map(records.map((r) => [r.key, r] as const));
  const out: AttributedFee[] = [];
  for (const record of records) {
    if (!countsTowardFeeTotals(record)) continue;
    const parent = record.linkedTo ? byKey.get(feeReviewDocId(record.linkedTo)) : undefined;
    const anchor = parent && countsTowardFeeTotals(parent) ? parent : record;
    out.push({
      record,
      feeType: anchor.feeType ?? record.feeType,
      accountId: anchor.source.accountId ?? record.source.accountId,
      provider: anchor.source.institution ?? record.source.institution ?? UNKNOWN_PROVIDER,
      month: record.source.date.slice(0, 7),
    });
  }
  return out;
}

/** Inclusive month range for a period, relative to `today` (YYYY-MM-DD). */
export function feePeriodMonths(period: FeePeriod, today: string): { from?: string; to?: string } {
  const month = today.slice(0, 7);
  switch (period) {
    case "this_month":
      return { from: month, to: month };
    case "last_3_months":
      return { from: shiftMonthKey(month, -2), to: month };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01`, to: month };
    case "last_12_months":
      return { from: shiftMonthKey(month, -11), to: month };
    case "all":
      return {};
  }
}

/** Account / type / provider filters (not the period). Shared with 318/322. */
export function matchesDimensions(item: AttributedFee, filters: FeeDashboardFilters): boolean {
  if (filters.accountIds.length > 0 && (!item.accountId || !filters.accountIds.includes(item.accountId))) return false;
  if (filters.feeTypes.length > 0 && (!item.feeType || !filters.feeTypes.includes(item.feeType))) return false;
  if (filters.providers.length > 0 && !filters.providers.includes(item.provider)) return false;
  return true;
}

function inMonths(item: AttributedFee, range: { from?: string; to?: string }): boolean {
  if (range.from && item.month < range.from) return false;
  if (range.to && item.month > range.to) return false;
  return true;
}

export interface FeeBreakdownRow {
  key: string;
  totals: FeeComponentTotals;
  /** netFee + netTax: what the charges actually cost. */
  cost: number;
  /** Share of the period's total cost, 0..1. */
  share: number;
}

export interface FeeTrendPoint {
  month: string;
  netFee: number;
  netTax: number;
  cost: number;
}

export interface FeeDashboard {
  /** The selected period with all filters applied. */
  totals: FeeComponentTotals;
  cost: number;
  /** Month comparison; ignores the period filter, keeps the others. */
  thisMonthCost: number;
  lastMonthCost: number;
  monthChange: { delta: number; pct: number | null };
  /** Last 12 months ending this month; ignores the period filter. */
  trend: FeeTrendPoint[];
  byType: FeeBreakdownRow[];
  byAccount: FeeBreakdownRow[];
  byProvider: FeeBreakdownRow[];
  /** Newest counted records in the selection. */
  recent: FeeRecord[];
  /** Candidates across everything — not narrowed by filters. */
  unreviewedCount: number;
  options: { accountIds: string[]; feeTypes: FeeTypeId[]; providers: string[] };
}

function costOf(t: FeeComponentTotals): number {
  return roundMoney(t.netFee + t.netTax);
}

function breakdown(
  items: readonly AttributedFee[],
  keyOf: (item: AttributedFee) => string | undefined,
  totalCost: number
): FeeBreakdownRow[] {
  const groups = new Map<string, FeeRecord[]>();
  for (const item of items) {
    const key = keyOf(item) ?? "";
    const list = groups.get(key);
    if (list) list.push(item.record);
    else groups.set(key, [item.record]);
  }
  return [...groups.entries()]
    .map(([key, records]) => {
      const totals = feeComponentTotals(records);
      const cost = costOf(totals);
      return { key, totals, cost, share: totalCost > 0 ? Math.max(0, cost) / totalCost : 0 };
    })
    .sort((a, b) => b.cost - a.cost || a.key.localeCompare(b.key));
}

export function buildFeeDashboard(
  records: readonly FeeRecord[],
  filters: FeeDashboardFilters,
  today: string
): FeeDashboard {
  const attributed = attributeFeeRecords(records);
  const dimensional = attributed.filter((item) => matchesDimensions(item, filters));
  const range = feePeriodMonths(filters.period, today);
  const selected = dimensional.filter((item) => inMonths(item, range));

  const totals = feeComponentTotals(selected.map((i) => i.record));
  const cost = costOf(totals);

  const month = today.slice(0, 7);
  const lastMonth = shiftMonthKey(month, -1);
  const monthCost = (m: string) => costOf(feeComponentTotals(dimensional.filter((i) => i.month === m).map((i) => i.record)));
  const thisMonthCost = monthCost(month);
  const lastMonthCost = monthCost(lastMonth);
  const delta = roundMoney(thisMonthCost - lastMonthCost);

  const trend: FeeTrendPoint[] = [];
  for (let offset = -11; offset <= 0; offset++) {
    const m = shiftMonthKey(month, offset);
    const t = feeComponentTotals(dimensional.filter((i) => i.month === m).map((i) => i.record));
    trend.push({ month: m, netFee: t.netFee, netTax: t.netTax, cost: costOf(t) });
  }

  const recent = selected
    .map((i) => i.record)
    .sort((a, b) => (a.source.date < b.source.date ? 1 : a.source.date > b.source.date ? -1 : a.key.localeCompare(b.key)))
    .slice(0, 10);

  const uniq = <T extends string>(values: Array<T | undefined>) =>
    [...new Set(values.filter((v): v is T => Boolean(v)))].sort((a, b) => a.localeCompare(b));

  return {
    totals,
    cost,
    thisMonthCost,
    lastMonthCost,
    monthChange: { delta, pct: lastMonthCost > 0 ? roundMoney((delta / lastMonthCost) * 100) : null },
    trend,
    byType: breakdown(selected, (i) => i.feeType ?? "other", cost),
    byAccount: breakdown(selected, (i) => i.accountId, cost),
    byProvider: breakdown(selected, (i) => i.provider, cost),
    recent,
    unreviewedCount: records.filter(needsFeeReview).length,
    options: {
      accountIds: uniq(attributed.map((i) => i.accountId)),
      feeTypes: uniq(attributed.map((i) => i.feeType)),
      providers: uniq(attributed.map((i) => i.provider)),
    },
  };
}

export function countActiveFeeFilters(filters: FeeDashboardFilters): number {
  return filters.accountIds.length + filters.feeTypes.length + filters.providers.length;
}
