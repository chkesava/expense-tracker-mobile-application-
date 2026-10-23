import { useEffect, useMemo } from "react";

import { useDashboardCashFlow } from "@/hooks/useDashboardCashFlow";
import { useExpenses } from "@/hooks/useExpenses";
import { shiftMonthKey } from "@/shared/utils/dates";
import { eligibleExpenses, monthlyCountSeries } from "@/shared/utils/spendingDrilldown";

/**
 * SPENDLY-574 — the month summaries a spending drill-down reads: the same
 * bounded `financialSummaries` window the dashboard listens to (`count` docs
 * ending at `month`), so no new collection, query shape or index.
 */
export function useSpendingSummaries(month: string, count: number) {
  const { summaries, loading, error } = useDashboardCashFlow(month, count);
  const current = useMemo(() => summaries.find((s) => s.period === month) ?? null, [summaries, month]);
  const previousMonth = shiftMonthKey(month, -1);
  const previous = useMemo(
    () => summaries.find((s) => s.period === previousMonth) ?? null,
    [summaries, previousMonth]
  );
  // Until the window for `month` arrives, `current` would read as "no spend".
  return { summaries, current, previous, loading: loading && !current, error };
}

/**
 * SPENDLY-574 — one month's eligible expense rows (optionally one category's)
 * from the app-wide `FinanceDataProvider` store. The store's first page may
 * not reach back to `month`, so this asks it for that month once
 * (`loadMonth`: one bounded date-range read, skipped when already loaded) —
 * no listener of its own.
 */
export function useMonthExpenseRows(month: string, category?: string) {
  const { expenses, loading, error, retry, isFromCache, monthsLoaded, loadMonth } = useExpenses();

  useEffect(() => {
    void loadMonth(month);
  }, [loadMonth, month]);

  const rows = useMemo(() => eligibleExpenses(expenses, month, category), [expenses, month, category]);
  const monthLoaded = monthsLoaded.has(month);

  return {
    rows,
    /** Nothing to show yet. */
    loading: loading && rows.length === 0,
    /**
     * The month's rows are known to be complete. Until then (or if the month
     * read failed, e.g. offline) the list may be partial and says so.
     */
    monthLoaded,
    error,
    retry,
    isFromCache,
  };
}

/**
 * SPENDLY-574 — transactions per month across `months`, for the trend chart's
 * "Transactions" view. Each month is asked for once through `loadMonth` (a
 * bounded date-range read, skipped when already loaded), and only while
 * `enabled` — the chart's Amount view needs none of this.
 */
export function useMonthlyTransactionCounts(months: readonly string[], category: string | undefined, enabled: boolean) {
  const { expenses, monthsLoaded, loadMonth } = useExpenses();
  const key = months.join(",");

  useEffect(() => {
    if (!enabled) return;
    for (const month of key.split(",")) void loadMonth(month);
  }, [enabled, key, loadMonth]);

  const series = useMemo(
    () => monthlyCountSeries(expenses, key.split(","), monthsLoaded, category),
    [expenses, key, monthsLoaded, category]
  );
  return { series, loading: enabled && series.some((p) => !p.hasData) };
}
