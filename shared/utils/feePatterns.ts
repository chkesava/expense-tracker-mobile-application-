/**
 * SPENDLY-318 — recurring and fee-pattern intelligence.
 *
 * Groups counted fee records by fee family and where they are charged (the
 * account, or the provider when the account is unknown), then describes what
 * the history shows: how often, how steady the amount, first/last seen, the
 * trend, and a derived yearly estimate.
 *
 * Guard rails (all tested):
 *   - A pattern needs real evidence: at least 3 charges across at least 2
 *     months, or 2 charges about a year apart with a similar amount (an
 *     annual fee).
 *   - Only a steady cadence *and* a steady amount is called "regular"; any
 *     other repetition is "repeated", never a subscription.
 *   - The yearly figure is always an estimate and carries the sentence that
 *     says what it was computed from.
 *   - Informational only: no provider comparison, no product advice.
 *   - Every pattern lists the records it rests on.
 *
 * Money comes from `feeComponentTotals` over the group (fees + GST − reversals),
 * the same sum the overview uses.
 */

import type { FeeRecord, FeeTypeId } from "../types/fee";
import { daysBetweenDateKeys, shiftMonthKey } from "./dates";
import { attributeFeeRecords, UNKNOWN_PROVIDER, type AttributedFee } from "./feeDashboard";
import { feeComponentTotals } from "./feeModel";
import { roundMoney } from "./money";

export const PATTERN_MIN_OCCURRENCES = 3;
export const PATTERN_MIN_MONTHS = 2;
/** Relative spread (coefficient of variation) at or under which an amount is "steady". */
const STEADY_AMOUNT_CV = 0.1;
/** A ±20% move between the last two quarters counts as a trend. */
const TREND_THRESHOLD = 0.2;

export type FeeCadence = "monthly" | "quarterly" | "yearly" | "irregular";
export type FeeTrend = "rising" | "falling" | "steady" | "new" | "stopped";

export interface FeePattern {
  /** `${feeType}|${where}` — stable while the history is. */
  id: string;
  feeType: FeeTypeId;
  accountId?: string;
  provider: string;
  cadence: FeeCadence;
  steadyAmount: boolean;
  /** True only for a steady cadence with a steady amount. */
  regular: boolean;
  occurrences: number;
  monthsWithCharges: number;
  firstSeen: string;
  lastSeen: string;
  /** Median charge (fee + GST on it), for "usually about ₹X". */
  typicalAmount: number;
  minAmount: number;
  maxAmount: number;
  /** Fees + GST − reversals across the whole history of this pattern. */
  totalCost: number;
  reversals: number;
  /** Derived yearly cost. Always an estimate — see `estimateBasis`. */
  estimatedYearly: number;
  estimateBasis: string;
  trend: FeeTrend;
  /** Charges in the last 90 days vs the 90 before. */
  recentCount: number;
  previousCount: number;
  /** Past its usual gap without a new charge. */
  mayHaveStopped: boolean;
  /** Plain-language reasons, each derived from the records. */
  signals: string[];
  /** Keys of every record the pattern rests on, oldest first. */
  recordKeys: string[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cv(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function classifyCadence(gaps: number[]): FeeCadence {
  if (gaps.length === 0) return "irregular";
  const m = median(gaps);
  const within = (lo: number, hi: number) => gaps.filter((g) => g >= lo && g <= hi).length / gaps.length >= 0.75;
  if (m >= 25 && m <= 35 && within(20, 40)) return "monthly";
  if (m >= 80 && m <= 100 && within(70, 110)) return "quarterly";
  if (m >= 330 && m <= 400 && within(320, 410)) return "yearly";
  return "irregular";
}

const CADENCE_TEXT: Record<Exclude<FeeCadence, "irregular">, string> = {
  monthly: "about once a month",
  quarterly: "about once a quarter",
  yearly: "about once a year",
};

function monthsInclusive(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Amount of one charge including GST attributed to it. */
function chargeAmounts(fees: AttributedFee[], all: AttributedFee[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of fees) out.set(f.record.key, f.record.components.fee + f.record.components.tax);
  for (const item of all) {
    if (item.record.role !== "tax_on_fee" || !item.record.linkedTo) continue;
    const parentKey = `${item.record.linkedTo.kind}__${item.record.linkedTo.id}`;
    const base = out.get(parentKey);
    if (base !== undefined) out.set(parentKey, roundMoney(base + item.record.components.tax));
  }
  return out;
}

export function detectFeePatterns(records: readonly FeeRecord[], today: string): FeePattern[] {
  const groups = new Map<string, AttributedFee[]>();
  for (const item of attributeFeeRecords(records)) {
    if (!item.feeType) continue;
    const where = item.accountId ? `acct:${item.accountId}` : `prov:${item.provider}`;
    const id = `${item.feeType}|${where}`;
    const list = groups.get(id);
    if (list) list.push(item);
    else groups.set(id, [item]);
  }

  const patterns: FeePattern[] = [];
  const todayMonth = today.slice(0, 7);

  for (const [id, items] of groups) {
    const fees = items
      .filter((i) => i.record.role === "fee")
      .sort((a, b) => (a.record.source.date < b.record.source.date ? -1 : a.record.source.date > b.record.source.date ? 1 : a.record.key.localeCompare(b.record.key)));
    if (fees.length < 2) continue;

    const dates = fees.map((f) => f.record.source.date);
    const months = new Set(fees.map((f) => f.month));
    const amountsByKey = chargeAmounts(fees, items);
    const amounts = fees.map((f) => amountsByKey.get(f.record.key) ?? 0);
    const gaps = dates.slice(1).map((d, i) => daysBetweenDateKeys(dates[i], d));
    const steadyAmount = cv(amounts) <= STEADY_AMOUNT_CV;
    const cadence = classifyCadence(gaps);

    const enough =
      (fees.length >= PATTERN_MIN_OCCURRENCES && months.size >= PATTERN_MIN_MONTHS) ||
      (fees.length >= 2 && cadence === "yearly" && steadyAmount);
    if (!enough) continue;

    const first = fees[0];
    const firstSeen = dates[0];
    const lastSeen = dates[dates.length - 1];
    const totals = feeComponentTotals(items.map((i) => i.record));
    const totalCost = roundMoney(totals.netFee + totals.netTax);
    const reversals = items.filter((i) => i.record.role === "reversal" || i.record.role === "refund").length;
    const typical = roundMoney(median(amounts));

    // Estimate
    let estimatedYearly: number;
    let estimateBasis: string;
    const cost = (list: AttributedFee[]) => {
      const t = feeComponentTotals(list.map((i) => i.record));
      return roundMoney(t.netFee + t.netTax);
    };
    if (cadence === "yearly") {
      estimatedYearly = typical;
      estimateBasis = `Estimate: one charge a year of about the usual amount, from ${fees.length} charges since ${firstSeen}.`;
    } else {
      const windowStart = shiftMonthKey(todayMonth, -11);
      const inLastYear = items.filter((i) => i.month >= windowStart && i.month <= todayMonth);
      const spanMonths = monthsInclusive(first.month, todayMonth);
      if (spanMonths >= 12) {
        estimatedYearly = cost(inLastYear);
        estimateBasis = "Estimate: what these charges cost you over the last 12 months.";
      } else {
        const months = Math.max(3, spanMonths);
        estimatedYearly = roundMoney((cost(inLastYear) / months) * 12);
        estimateBasis = `Estimate: ${months} months of history scaled to a year. It will change as more months come in.`;
      }
    }

    // Trend: last 3 months vs the 3 before.
    const recent3 = items.filter((i) => i.month > shiftMonthKey(todayMonth, -3) && i.month <= todayMonth);
    const prev3 = items.filter((i) => i.month > shiftMonthKey(todayMonth, -6) && i.month <= shiftMonthKey(todayMonth, -3));
    const recentCost = cost(recent3);
    const prevCost = cost(prev3);
    let trend: FeeTrend = "steady";
    if (prevCost <= 0 && recentCost > 0) trend = first.month > shiftMonthKey(todayMonth, -3) ? "new" : "steady";
    // Nothing in the last 3 months: the charges are all older, so it has stopped.
    else if (recentCost <= 0) trend = "stopped";
    else if (prevCost > 0 && recentCost > prevCost * (1 + TREND_THRESHOLD)) trend = "rising";
    else if (prevCost > 0 && recentCost < prevCost * (1 - TREND_THRESHOLD)) trend = "falling";

    const recentCount = fees.filter((f) => {
      const d = daysBetweenDateKeys(f.record.source.date, today);
      return d >= 0 && d < 90;
    }).length;
    const previousCount = fees.filter((f) => {
      const d = daysBetweenDateKeys(f.record.source.date, today);
      return d >= 90 && d < 180;
    }).length;

    const usualGap = median(gaps);
    const mayHaveStopped = usualGap > 0 && daysBetweenDateKeys(lastSeen, today) > Math.max(2 * usualGap, 45);
    const regular = cadence !== "irregular" && steadyAmount;

    const signals: string[] = [];
    signals.push(`Charged ${fees.length} times across ${months.size} ${months.size === 1 ? "month" : "months"}, first on ${firstSeen}, most recently on ${lastSeen}.`);
    if (cadence !== "irregular") signals.push(`Charges come ${CADENCE_TEXT[cadence]}.`);
    else signals.push("Charges repeat, but not on a regular schedule.");
    signals.push(steadyAmount ? `Usually about the same amount each time.` : `The amount varies between charges.`);
    if (reversals > 0) signals.push(`${reversals} ${reversals === 1 ? "was" : "were"} reversed or refunded.`);
    if (trend === "rising") signals.push("Higher in the last 3 months than the 3 before.");
    if (trend === "falling") signals.push("Lower in the last 3 months than the 3 before.");
    if (mayHaveStopped) signals.push("No new charge for longer than usual — it may have stopped.");

    patterns.push({
      id,
      feeType: fees[0].feeType!,
      accountId: first.accountId,
      provider: first.provider ?? UNKNOWN_PROVIDER,
      cadence,
      steadyAmount,
      regular,
      occurrences: fees.length,
      monthsWithCharges: months.size,
      firstSeen,
      lastSeen,
      typicalAmount: typical,
      minAmount: roundMoney(Math.min(...amounts)),
      maxAmount: roundMoney(Math.max(...amounts)),
      totalCost,
      reversals,
      estimatedYearly: Math.max(0, estimatedYearly),
      estimateBasis,
      trend,
      recentCount,
      previousCount,
      mayHaveStopped,
      signals,
      recordKeys: items
        .map((i) => i.record)
        .sort((a, b) => (a.source.date < b.source.date ? -1 : a.source.date > b.source.date ? 1 : a.key.localeCompare(b.key)))
        .map((r) => r.key),
    });
  }

  return patterns.sort((a, b) => b.estimatedYearly - a.estimatedYearly || (a.lastSeen < b.lastSeen ? 1 : -1) || a.id.localeCompare(b.id));
}

/** "Regular charge" only for steady cadence and amount; everything else "Repeated". */
export function feePatternLabel(pattern: Pick<FeePattern, "regular" | "cadence">): string {
  if (!pattern.regular) return "Repeated charge";
  return pattern.cadence === "monthly" ? "Regular monthly charge" : pattern.cadence === "quarterly" ? "Regular quarterly charge" : "Regular yearly charge";
}
