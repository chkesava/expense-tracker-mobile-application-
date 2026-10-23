import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useExpenses } from "@/hooks/useExpenses";
import type { LoadFailure } from "@/lib/firestoreErrors";
import { summaryMonthStore } from "@/lib/summaryMonthStore";
import { useAuth } from "@/providers/AuthProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";
import { eligibleExpenses, monthlyCountSeries } from "@/shared/utils/spendingDrilldown";

/**
 * SPENDLY-574 — the month summaries a spending drill-down reads: the
 * `dashboard_{YYYY-MM}` docs for the `count` months ending at `month`.
 *
 * PR #239 review: through the shared per-month store (`lib/summaryMonthStore`),
 * not `useDashboardCashFlow`, so
 * - each month's doc is read once per session and shared by every screen
 *   (moving between months only reads the months not seen yet);
 * - the read-model `cashFlow` switch, which keeps only the last two months
 *   as summaries in `supabase` mode, can't cut these windows short.
 * The values are Firestore's authoritative summaries (READ_MODEL_RULES R4).
 */
export function useSpendingSummaries(month: string, count: number) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const months = useMemo(() => Array.from({ length: Math.max(1, count) }, (_, i) => shiftMonthKey(month, -i)), [month, count]);
  const monthsKey = months.join(",");

  useEffect(() => {
    if (!uid) return;
    return summaryMonthStore.acquire(uid, monthsKey.split(","));
  }, [uid, monthsKey]);

  const version = useSyncExternalStore(summaryMonthStore.subscribe, summaryMonthStore.version, summaryMonthStore.version);

  const { summaries, loading, error } = useMemo(() => {
    const list: DashboardPeriodSummary[] = [];
    let pending = false;
    let failure: LoadFailure | null = null;
    for (const m of monthsKey.split(",")) {
      const entry = uid ? summaryMonthStore.get(uid, m) : undefined;
      if (!entry || entry.status === "loading") pending = true;
      if (entry?.error && !failure) failure = entry.error;
      if (entry?.summary) list.push(entry.summary);
    }
    list.sort((a, b) => b.period.localeCompare(a.period));
    return { summaries: list, loading: !!uid && pending, error: failure };
    // `version` changes whenever any month's data arrives.
  }, [uid, monthsKey, version]);

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
export function useMonthExpenseRows(month: string, category?: string, subcategory?: string) {
  const { expenses, loading, error, retry, isFromCache, monthsLoaded, loadMonth } = useExpenses();

  useEffect(() => {
    void loadMonth(month);
  }, [loadMonth, month]);

  const rows = useMemo(
    () => eligibleExpenses(expenses, month, category, subcategory),
    [expenses, month, category, subcategory]
  );
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
export function useMonthlyTransactionCounts(
  months: readonly string[],
  category: string | undefined,
  enabled: boolean,
  subcategory?: string
) {
  const { expenses, monthsLoaded, loadMonth } = useExpenses();
  const key = months.join(",");

  useEffect(() => {
    if (!enabled) return;
    for (const month of key.split(",")) void loadMonth(month);
  }, [enabled, key, loadMonth]);

  const series = useMemo(
    () => monthlyCountSeries(expenses, key.split(","), monthsLoaded, category, subcategory),
    [expenses, key, monthsLoaded, category, subcategory]
  );
  return { series, loading: enabled && series.some((p) => !p.hasData) };
}
