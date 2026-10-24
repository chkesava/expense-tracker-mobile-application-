/**
 * SPENDLY-585 — the Journal's pull-to-refresh decision and its count copy.
 *
 * The Journal reads `expenses` and `incomes` from `FinanceDataProvider`'s
 * realtime listeners, which already deliver every change as it happens.
 * Re-subscribing them (`retryFinanceData`) restarts all seven finance
 * listeners, and with the memory-only native cache that re-reads every
 * document they cover. So a refresh only re-subscribes when a listener has
 * actually failed; otherwise there is nothing newer to fetch.
 */

export type JournalRefreshAction = "resubscribe" | "none";

export function journalRefreshAction(input: { hasError: boolean }): JournalRefreshAction {
  return input.hasError ? "resubscribe" : "none";
}

/**
 * The label beside the Journal's period count. The count is the selected
 * period's rows, so the label names the period, and says "loaded so far"
 * only while that period isn't known to be complete.
 */
export function journalScopeLabel(input: {
  monthKey: string;
  monthOverridden: boolean;
  periodComplete: boolean;
}): string {
  const period = input.monthOverridden ? "custom range" : input.monthKey;
  return input.periodComplete ? period : `${period} · loaded so far`;
}

/**
 * The notice shown while older history hasn't been paged in. It used to quote
 * the size of the app-wide live window ("Displaying the latest 342"), which
 * read as if the Journal had fetched that many rows for the month.
 */
export function journalHistoryNotice(input: { periodComplete: boolean }): {
  title: string;
  body: string;
} {
  return input.periodComplete
    ? {
        title: "Older history not loaded",
        body: "Everything in this period is shown. Older transactions load when you pick an earlier month or tap below.",
      }
    : {
        title: "Showing recent transactions",
        body: "Some of this period may be older than what's loaded. Scroll down or tap below to load older history.",
      };
}
