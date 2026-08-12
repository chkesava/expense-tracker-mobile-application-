/**
 * Phase 15 — sentence-style insights from collected expenses.
 * Pure: no Firebase / React Native.
 */

import { parseLocalDate, toLocalDateKey } from "./dates";
import { formatAmount } from "./formatCurrency";

export type SmartInsightKind = "week_total" | "category_change" | "budget";
export type SmartInsightTone = "info" | "up" | "down" | "warning";

export type SmartInsight = {
  id: string;
  kind: SmartInsightKind;
  text: string;
  tone: SmartInsightTone;
};

export type SmartInsightExpense = {
  amount: number;
  date: string;
  month?: string;
  category?: string;
};

export type BuildSmartInsightsInput = {
  expenses: SmartInsightExpense[];
  monthlyBudget?: number;
  currency?: string;
  /** YYYY-MM-DD. Defaults to today. */
  today?: string;
};

const CATEGORY_CHANGE_MIN_PCT = 10;
const BUDGET_APPROACH_PCT = 0.8;

function shiftDateKey(dateKey: string, days: number): string {
  const date = parseLocalDate(dateKey);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

function inInclusiveRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function sumAmounts(items: SmartInsightExpense[]): number {
  return items.reduce((total, item) => total + (item.amount || 0), 0);
}

function briefCategory(category: string): string {
  const brief = category.split(/[&/]/)[0]?.trim();
  return brief || category || "Spending";
}

function totalsByCategory(
  items: SmartInsightExpense[]
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const category = item.category?.trim() || "Other";
    totals.set(category, (totals.get(category) || 0) + (item.amount || 0));
  }
  return totals;
}

/**
 * Last-7-days spend, week-over-week category movers, and monthly budget warnings.
 */
export function buildSmartInsights(
  input: BuildSmartInsightsInput
): SmartInsight[] {
  const today = input.today || toLocalDateKey(new Date());
  const currency = input.currency || "INR";
  const weekStart = shiftDateKey(today, -6);
  const prevEnd = shiftDateKey(weekStart, -1);
  const prevStart = shiftDateKey(prevEnd, -6);
  const monthKey = today.slice(0, 7);

  const thisWeek = input.expenses.filter((item) =>
    inInclusiveRange(item.date, weekStart, today)
  );
  const lastWeek = input.expenses.filter((item) =>
    inInclusiveRange(item.date, prevStart, prevEnd)
  );
  const thisMonth = input.expenses.filter(
    (item) => (item.month || item.date.slice(0, 7)) === monthKey
  );

  const insights: SmartInsight[] = [];
  const thisByCategory = totalsByCategory(thisWeek);
  const lastByCategory = totalsByCategory(lastWeek);

  let topMover:
    | { category: string; pct: number }
    | undefined;
  for (const [category, amount] of thisByCategory) {
    const previous = lastByCategory.get(category) || 0;
    if (previous <= 0) continue;
    const pct = Math.round(((amount - previous) / previous) * 100);
    if (Math.abs(pct) < CATEGORY_CHANGE_MIN_PCT) continue;
    if (!topMover || Math.abs(pct) > Math.abs(topMover.pct)) {
      topMover = { category, pct };
    }
  }

  if (topMover) {
    const name = briefCategory(topMover.category);
    const increased = topMover.pct >= 0;
    insights.push({
      id: "category_change",
      kind: "category_change",
      text: `${increased ? "📈" : "📉"} ${name} spending ${
        increased ? "increased" : "decreased"
      } ${Math.abs(topMover.pct)}% this week.`,
      tone: increased ? "up" : "down",
    });
  }

  const weekTotal = sumAmounts(thisWeek);
  if (weekTotal > 0) {
    insights.push({
      id: "week_total",
      kind: "week_total",
      text: `💰 You spent ${formatAmount(weekTotal, currency)} this week.`,
      tone: "info",
    });
  }

  const budget = input.monthlyBudget || 0;
  if (budget > 0) {
    const monthSpent = sumAmounts(thisMonth);
    const ratio = monthSpent / budget;
    if (ratio >= 1) {
      insights.push({
        id: "budget",
        kind: "budget",
        text: "⚠️ You've exceeded your monthly budget.",
        tone: "warning",
      });
    } else if (ratio >= BUDGET_APPROACH_PCT) {
      insights.push({
        id: "budget",
        kind: "budget",
        text: "⚠️ You're approaching your monthly budget.",
        tone: "warning",
      });
    }
  }

  return insights;
}
