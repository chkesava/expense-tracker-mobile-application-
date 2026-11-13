/**
 * SPENDLY-718 — the desktop dashboard composition (web, ≥ 1280px).
 *
 * Pure helpers so the slotting and the totals' change are provable in Vitest.
 * Nothing here computes a balance: the totals' change is the difference
 * between two stored net-worth snapshots, exactly as the net-worth trend
 * (SPENDLY-568) measures net worth.
 */
import type { NetWorthPoint } from "./netWorthHistory";

/** The dashboard's "More" card ids, as `app/(app)/dashboard.tsx` builds them. */
export type DesktopMoreCardId = string;

export type DesktopDashboardPlan<Id extends DesktopMoreCardId> = {
  /** Income vs expenses, beside Spending Overview. */
  cashFlow: boolean;
  /** Budget progress, beside Spending Overview / Income vs Expenses. */
  budget: boolean;
  /**
   * Every other More card, in the user's order, for the grid below. When
   * Budget is placed, its Category Budgets lead the grid as their own card
   * ("budgetCategories"), so the fixed row keeps one budget card. Upcoming
   * bills (subscriptions) is no longer lifted out by name — the reference
   * layout (SPENDLY dashboard redesign) has no fixed slot for it, so it stays
   * an ordinary user-toggleable "More" card here.
   */
  rest: Array<Id | typeof BUDGET_CATEGORIES>;
};

/** The Category Budgets half of the Budget card, as its own grid card. */
export const BUDGET_CATEGORIES = "budgetCategories" as const;

/**
 * Every id the desktop composition's fixed rows already place directly
 * (`app/(app)/dashboard.tsx`'s `rows`), so `rest` never hands the same card
 * to the "more" grid a second time. `topCategory`, `spendingTrend`,
 * `cashFlowCard` and `spendingHeatmap` are fixed-row-only and never added to
 * `moreCardIds`, so they don't need listing here; these four are also always
 * appended to `moreCardIds`, which was duplicating them below the fold.
 *
 * `accounts` is here for a different reason (SPENDLY dashboard redesign
 * fix): the "more" grid's masonry deals cards round-robin by index, not by
 * height, so one unusually tall card (accounts' own 5-tile wrap grid)
 * landing in a column made that whole column far taller than its siblings
 * — the other two columns' content ended, leaving the rest of the row
 * blank beside it. `accounts` gets its own full-width fixed row instead.
 */
const PLACED = new Set([
  "cashFlow",
  "budgetAlerts",
  "categoryInsights",
  "investmentsSummary",
  "vaultsSummary",
  "shortcuts",
  "accounts",
]);

/**
 * Lifts the cards the reference places by name (income vs expenses, budget
 * progress) out of the More list. A card the user has turned off is simply
 * not in `moreIds`, so its slot is left out and the row re-flexes; everything
 * else keeps its saved order.
 */
export function planDesktopDashboard<Id extends DesktopMoreCardId>(
  moreIds: readonly Id[]
): DesktopDashboardPlan<Id> {
  return {
    cashFlow: moreIds.includes("cashFlow" as Id),
    budget: moreIds.includes("budgetAlerts" as Id),
    rest: [
      ...(moreIds.includes("budgetAlerts" as Id) ? [BUDGET_CATEGORIES] : []),
      ...moreIds.filter((id) => !PLACED.has(id)),
    ],
  };
}

/** Card gap: roomier on large monitors, tighter on a 1280–1599 laptop. */
export function desktopDashboardGap(width: number): number {
  return width >= 1600 ? 20 : 16;
}

/**
 * Spending Overview | Income vs Expenses. From 1440 the two halves are equal
 * and Income vs Expenses sets its figures beside the chart; on a 1280–1439
 * laptop Spending Overview takes the larger share (its legend carries names,
 * shares and amounts) and Income vs Expenses keeps its stacked layout.
 */
export function desktopAnalyticsSplit(width: number): {
  weights: [number, number];
  cashFlowWide: boolean;
} {
  return width >= 1440 ? { weights: [1, 1], cashFlowWide: true } : { weights: [56, 44], cashFlowWide: false };
}

export type TotalKind = "assets" | "liabilities";

export type TotalChange = {
  /** latest − baseline for this total; null without two distinct days. */
  change: number | null;
  /** change ÷ baseline, as a percentage; null when the baseline is zero. */
  changePct: number | null;
};

/**
 * Change of total assets or liabilities between the two snapshots the
 * net-worth trend already picked for the period (`netWorthTrend`'s
 * `baseline` and `latest`), so the totals and the hero always describe the
 * same window.
 */
export function totalChange(
  baseline: NetWorthPoint | null,
  latest: NetWorthPoint | null,
  kind: TotalKind
): TotalChange {
  if (!baseline || !latest || baseline.date === latest.date) {
    return { change: null, changePct: null };
  }
  const from = baseline[kind];
  const to = latest[kind];
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { change: null, changePct: null };
  const change = Math.round((to - from) * 100) / 100;
  const changePct = from === 0 ? null : (change / Math.abs(from)) * 100;
  return { change, changePct };
}

/**
 * Whether a move in a total is good news: assets rising is, liabilities
 * rising is not. Colour is never the only signal — the card also shows the
 * arrow and the signed figure.
 */
export function totalChangeTone(kind: TotalKind, change: number | null): "good" | "bad" | "flat" {
  if (change === null || change === 0) return "flat";
  const up = change > 0;
  return (kind === "assets" ? up : !up) ? "good" : "bad";
}

/**
 * Month-over-month change for a KPI that isn't a net-worth snapshot field
 * (income, expense) — a sibling to `totalChange`, not an overload of it:
 * `totalChange` specifically diffs two stored net-worth snapshots, while this
 * is a plain subtraction between the active and previous month's own totals
 * (`useDashboardCashFlow`'s `activeSummary`/`previousSummary`).
 */
export function monthOverMonthChange(current: number, previous: number): TotalChange {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { change: null, changePct: null };
  }
  const change = Math.round((current - previous) * 100) / 100;
  const changePct = previous === 0 ? null : (change / Math.abs(previous)) * 100;
  return { change, changePct };
}
