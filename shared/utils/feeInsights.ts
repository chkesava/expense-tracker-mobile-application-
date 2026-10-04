/**
 * SPENDLY-322 — fee insights.
 *
 * Short, evidence-backed statements about the user's own fee history. Every
 * insight:
 *   - is computed from identifiable records and lists them (`recordKeys`);
 *   - states how it was worked out (`basis`), including when a figure is an
 *     estimate;
 *   - compares only against the user's own past, never against providers or
 *     products, and recommends nothing.
 *
 * "Worth understanding" prompts describe what usually triggers a kind of
 * charge (a fact about the charge) next to how often the user actually saw
 * it (a fact about their data). They never claim a fee was avoidable.
 *
 * All money goes through `feeComponentTotals` (fees + GST − reversals).
 */

import { feeTypeLabel } from "../data/feeTaxonomy";
import type { FeeRecord, FeeTypeId } from "../types/fee";
import { daysBetweenDateKeys, shiftMonthKey } from "./dates";
import {
  attributeFeeRecords,
  matchesDimensions,
  type AttributedFee,
  type FeeDashboardFilters,
} from "./feeDashboard";
import { feeComponentTotals } from "./feeModel";
import { detectFeePatterns } from "./feePatterns";
import { roundMoney } from "./money";

export type FeeInsightKind =
  | "month_total"
  | "top_type"
  | "top_source"
  | "vs_own_average"
  | "repeating"
  | "trend"
  | "worth_understanding";

export interface FeeInsight {
  id: string;
  kind: FeeInsightKind;
  title: string;
  body: string;
  /** How the numbers were worked out. Always present. */
  basis: string;
  /** Records the insight rests on; never empty. */
  recordKeys: string[];
}

/** Months of the user's own history the baseline averages over. */
const BASELINE_MONTHS = 6;
/** How much this month must differ from the baseline to be worth saying. */
const BASELINE_THRESHOLD = 0.25;
const PROMPT_WINDOW_DAYS = 180;

/**
 * What typically triggers a charge — general facts about the charge type,
 * worded as description, not advice.
 */
const TRIGGERS: Partial<Record<FeeTypeId, string>> = {
  atm_cash: "Banks usually charge this when ATM withdrawals go beyond the free monthly limit or use another bank's ATM.",
  min_balance: "Banks usually charge this when an account's average balance falls below its required level.",
  late_payment: "This is usually charged when a payment reaches the lender after its due date.",
  cash_advance: "Card issuers usually charge this when cash is withdrawn using a credit card.",
  forex: "This is usually charged on card payments made in a foreign currency or to overseas merchants.",
  cheque: "This is usually charged when a cheque or mandate is returned unpaid.",
};

const cost = (items: readonly AttributedFee[]) => {
  const t = feeComponentTotals(items.map((i) => i.record));
  return roundMoney(t.netFee + t.netTax);
};

const keysOf = (items: readonly AttributedFee[]) =>
  [...items]
    .sort((a, b) => (a.record.source.date < b.record.source.date ? 1 : a.record.source.date > b.record.source.date ? -1 : a.record.key.localeCompare(b.record.key)))
    .map((i) => i.record.key);

function inr(value: number): string {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

function groupBy<K>(items: readonly AttributedFee[], keyOf: (i: AttributedFee) => K): Map<K, AttributedFee[]> {
  const map = new Map<K, AttributedFee[]>();
  for (const item of items) {
    const k = keyOf(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function buildFeeInsights(
  records: readonly FeeRecord[],
  today: string,
  filters: Pick<FeeDashboardFilters, "accountIds" | "feeTypes" | "providers"> = { accountIds: [], feeTypes: [], providers: [] }
): FeeInsight[] {
  const dims = { period: "all" as const, ...filters };
  const items = attributeFeeRecords(records).filter((i) => matchesDimensions(i, dims));
  const month = today.slice(0, 7);
  const thisMonth = items.filter((i) => i.month === month);
  const out: FeeInsight[] = [];
  const monthCost = cost(thisMonth);

  // 1. This month's total.
  if (thisMonth.length > 0 && monthCost > 0) {
    const t = feeComponentTotals(thisMonth.map((i) => i.record));
    const charges = thisMonth.filter((i) => i.record.role === "fee").length;
    out.push({
      id: `month_total:${month}`,
      kind: "month_total",
      title: `You paid ${inr(monthCost)} in fees this month`,
      body: `${inr(t.netFee)} in fees and ${inr(t.netTax)} in GST on fees${t.reversedFee + t.reversedTax > 0 ? `, after ${inr(t.reversedFee + t.reversedTax)} was reversed` : ""}.`,
      basis: `Sum of ${charges} ${charges === 1 ? "charge" : "charges"} counted this month, including GST on those fees and minus reversals. Interest is not included.`,
      recordKeys: keysOf(thisMonth),
    });

    // 2. Biggest fee family this month.
    const byType = [...groupBy(thisMonth, (i) => i.feeType ?? "other")].map(([k, v]) => ({ k, v, c: cost(v) })).sort((a, b) => b.c - a.c || String(a.k).localeCompare(String(b.k)));
    if (byType.length > 1 && byType[0].c > 0) {
      const share = Math.round((byType[0].c / monthCost) * 100);
      out.push({
        id: `top_type:${month}:${byType[0].k}`,
        kind: "top_type",
        title: `${feeTypeLabel(byType[0].k as FeeTypeId)} was your biggest fee this month`,
        body: `${inr(byType[0].c)}, ${share}% of this month's fees.`,
        basis: `Compared across the ${byType.length} kinds of fee you were charged this month.`,
        recordKeys: keysOf(byType[0].v),
      });
    }

    // 3. Where most of it came from (the user's own sources, not a ranking of providers).
    const bySource = [...groupBy(thisMonth, (i) => i.provider)].map(([k, v]) => ({ k, v, c: cost(v) })).sort((a, b) => b.c - a.c || a.k.localeCompare(b.k));
    if (bySource.length > 1 && bySource[0].c > 0) {
      out.push({
        id: `top_source:${month}:${bySource[0].k}`,
        kind: "top_source",
        title: `Most of this month's fees came from ${bySource[0].k}`,
        body: `${inr(bySource[0].c)} of ${inr(monthCost)}.`,
        basis: `Grouped by the bank or provider on each charge this month.`,
        recordKeys: keysOf(bySource[0].v),
      });
    }
  }

  // 4. This month against the user's own recent average.
  const baselineMonths = Array.from({ length: BASELINE_MONTHS }, (_, i) => shiftMonthKey(month, -(i + 1)));
  const baselineItems = items.filter((i) => baselineMonths.includes(i.month));
  const monthsWithData = new Set(baselineItems.map((i) => i.month)).size;
  if (monthsWithData >= 3 && thisMonth.length > 0) {
    const average = roundMoney(cost(baselineItems) / BASELINE_MONTHS);
    const diff = roundMoney(monthCost - average);
    if (average > 0 && Math.abs(diff) >= average * BASELINE_THRESHOLD) {
      out.push({
        id: `vs_own_average:${month}`,
        kind: "vs_own_average",
        title: diff > 0 ? `Fees are higher than usual this month` : `Fees are lower than usual this month`,
        body: `${inr(monthCost)} this month against your own average of ${inr(average)} a month.`,
        basis: `Your average is your fees over the previous ${BASELINE_MONTHS} months divided by ${BASELINE_MONTHS}, including months with no fees.`,
        recordKeys: keysOf([...thisMonth, ...baselineItems]),
      });
    }
  }

  // 5 & 6. Repeating fees and their trends (318).
  const patterns = detectFeePatterns(records, today).filter(
    (p) =>
      (filters.accountIds.length === 0 || (p.accountId && filters.accountIds.includes(p.accountId))) &&
      (filters.feeTypes.length === 0 || filters.feeTypes.includes(p.feeType)) &&
      (filters.providers.length === 0 || filters.providers.includes(p.provider))
  );
  const live = patterns.filter((p) => !p.mayHaveStopped);
  if (live.length > 0) {
    const yearly = roundMoney(live.reduce((s, p) => s + p.estimatedYearly, 0));
    out.push({
      id: `repeating:${live.map((p) => p.id).join(",")}`,
      kind: "repeating",
      title: `${live.length} ${live.length === 1 ? "fee keeps" : "fees keep"} coming back`,
      body: `Together about ${inr(yearly)} a year, if they continue as they have.`,
      basis: "Estimate: each repeating fee's yearly figure added together. Each figure comes from that fee's own history and will change as new charges arrive.",
      recordKeys: [...new Set(live.flatMap((p) => p.recordKeys))].reverse(),
    });
  }
  for (const p of patterns) {
    if (p.trend !== "rising" && p.trend !== "falling") continue;
    out.push({
      id: `trend:${p.id}:${month}`,
      kind: "trend",
      title: `${feeTypeLabel(p.feeType)} fees are ${p.trend === "rising" ? "rising" : "falling"}`,
      body: `${p.trend === "rising" ? "Higher" : "Lower"} in the last 3 months than in the 3 months before.`,
      basis: "Compares what these charges cost in the last 3 months with the 3 months before that.",
      recordKeys: [...p.recordKeys].reverse(),
    });
  }

  // 7. Worth understanding: what triggers a charge you keep seeing.
  const recent = items.filter((i) => {
    const d = daysBetweenDateKeys(i.record.source.date, today);
    return i.record.role === "fee" && d >= 0 && d <= PROMPT_WINDOW_DAYS;
  });
  for (const [type, list] of groupBy(recent, (i) => i.feeType)) {
    const trigger = type ? TRIGGERS[type] : undefined;
    if (!type || !trigger || list.length < 2) continue;
    out.push({
      id: `worth_understanding:${type}:${month}`,
      kind: "worth_understanding",
      title: `About your ${feeTypeLabel(type).toLowerCase()} charges`,
      body: `You were charged ${list.length} times in the last 6 months (${inr(cost(list))}). ${trigger}`,
      basis: "The count and amount come from your transactions. The description is general information about this kind of charge, not a statement about your account.",
      recordKeys: keysOf(list),
    });
  }

  return out;
}
