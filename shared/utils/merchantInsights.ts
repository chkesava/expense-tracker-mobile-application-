import type { MerchantLedgerItem } from "./merchantGrouping";
import { classifyRecurringCadence } from "../../services/sms/smsRecurringDetector";

export interface MerchantInsightWindow {
  /** Inclusive ISO dates for the current period. */
  currentFrom: string;
  currentTo: string;
  /** Optional explicit comparison period. */
  previousFrom?: string;
  previousTo?: string;
}

export interface MerchantInsights {
  transactionCount: number;
  totalSpend: number;
  averageTransaction: number;
  spendByMonth: Array<{ month: string; amount: number; transactionCount: number }>;
  concentrationShare: number | null;
  monthOverMonth: { current: number; previous: number; change: number } | null;
  recurring: ReturnType<typeof classifyRecurringCadence>;
  observations: string[];
}

const MIN_SIGNAL_TRANSACTIONS = 3;

function uniqueItems(items: readonly MerchantLedgerItem[]): MerchantLedgerItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function expenseAmount(item: MerchantLedgerItem): number {
  return item.kind === "expense" ? item.amount : -item.amount;
}

function monthBuckets(items: readonly MerchantLedgerItem[]) {
  const buckets = new Map<string, { amount: number; transactionCount: number }>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    const bucket = buckets.get(month) ?? { amount: 0, transactionCount: 0 };
    bucket.amount += expenseAmount(item);
    bucket.transactionCount += 1;
    buckets.set(month, bucket);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, ...value }));
}

/** Pure, user-history-only merchant observations. No network or writes. */
export function buildMerchantInsights(
  sourceItems: readonly MerchantLedgerItem[],
  window?: MerchantInsightWindow,
  userTotalSpend?: number,
): MerchantInsights {
  const items = uniqueItems(sourceItems).filter((item) =>
    window ? inRange(item.date, window.currentFrom, window.currentTo) : true,
  );
  const totalSpend = items.reduce((sum, item) => sum + expenseAmount(item), 0);
  const spendByMonth = monthBuckets(items);
  const dates = [...new Set(items.map((item) => item.date))].sort();
  const previous = window?.previousFrom && window.previousTo
    ? uniqueItems(sourceItems).filter((item) => inRange(item.date, window.previousFrom!, window.previousTo!))
    : [];
  const previousTotal = previous.reduce((sum, item) => sum + expenseAmount(item), 0);
  const currentTotal = totalSpend;
  const monthOverMonth = previous.length > 0
    ? { current: currentTotal, previous: previousTotal, change: currentTotal - previousTotal }
    : null;
  const recurring = classifyRecurringCadence(dates);
  const concentrationShare = userTotalSpend && userTotalSpend > 0
    ? Math.max(0, totalSpend) / userTotalSpend
    : null;
  const observations: string[] = [];
  if (items.length < MIN_SIGNAL_TRANSACTIONS) {
    observations.push("Not enough history for a reliable spending pattern.");
  } else {
    observations.push(`${items.length} transactions observed across ${spendByMonth.length} month${spendByMonth.length === 1 ? "" : "s"}.`);
    if (recurring) observations.push(`Observed a possible ${recurring.frequency} pattern; this is not a confirmation of a subscription.`);
    if (monthOverMonth && monthOverMonth.change !== 0) {
      observations.push(`Observed ${monthOverMonth.change > 0 ? "higher" : "lower"} spend in the current window than the comparison window.`);
    }
    if (concentrationShare !== null && concentrationShare >= 0.25) {
      observations.push("This merchant represents a notable share of the selected spending window.");
    }
  }
  return {
    transactionCount: items.length,
    totalSpend,
    averageTransaction: items.length ? totalSpend / items.length : 0,
    spendByMonth,
    concentrationShare,
    monthOverMonth,
    recurring,
    observations,
  };
}

