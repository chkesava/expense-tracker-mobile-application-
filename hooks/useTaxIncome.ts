import { useEffect, useMemo } from "react";

import { logWarning } from "@/lib/errors";
import { useInvestments } from "@/hooks/useInvestments";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useTaxEntries, useTaxReviews } from "@/hooks/useTaxData";
import { useIncomesContext } from "@/providers/FinanceDataProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { assembleTaxIncome, incomeMonthsNeeded, type TaxIncomeSummary } from "@/shared/features/tax/utils/income";
import { todayDateKey } from "@/shared/utils/dates";

/**
 * Tax-relevant income for one financial year (SPENDLY-290): Spendly incomes,
 * deposit interest, and the user's own entries and decisions.
 *
 * Reads only while the income screen is open (SPENDLY-406):
 *   - incomes: the ledger provider keeps the newest rows; this loads each
 *     month of the year once (`loadIncomesForMonth`, bounded by date) so the
 *     year is complete before any total is shown;
 *   - deposits: `useInvestments` (its own read switch);
 *   - entries and reviews: `useTaxEntries` / `useTaxReviews`, bounded to the year.
 *
 * Display only. Decisions are re-checked on Firestore before they are saved
 * (`services/tax/taxIncomeStore.ts`, R4.3a).
 */
export function useTaxIncome(fy: FinancialYearKey, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { settings } = useSettings();
  const todayKey = todayDateKey(settings?.timezone);
  const {
    incomes,
    incomesComplete,
    incomeMonthsLoaded,
    loadIncomesForMonth,
    financeError,
    retryFinanceData,
  } = useIncomesContext();
  const investmentsEnabled = useInvestmentsEnabled();
  const deposits = useInvestments({ enabled: enabled && investmentsEnabled });
  const entries = useTaxEntries(fy, { enabled });
  const reviews = useTaxReviews(fy, { enabled });

  const needed = useMemo(() => incomeMonthsNeeded(fy, todayKey), [fy, todayKey]);

  useEffect(() => {
    if (!enabled || incomesComplete) return;
    for (const month of needed) {
      if (incomeMonthsLoaded.has(month)) continue;
      // Each month loads once; a failure leaves it missing and the year incomplete.
      loadIncomesForMonth(month).catch((err) => logWarning("tax.income.loadMonth", err));
    }
  }, [enabled, incomesComplete, needed, incomeMonthsLoaded, loadIncomesForMonth]);

  const summary: TaxIncomeSummary = useMemo(
    () =>
      assembleTaxIncome({
        fy,
        todayKey,
        incomes,
        investments: investmentsEnabled ? deposits.investments : [],
        entries: entries.entries,
        reviews: reviews.reviews,
        monthsLoaded: incomeMonthsLoaded,
        ledgerComplete: incomesComplete,
      }),
    [fy, todayKey, incomes, investmentsEnabled, deposits.investments, entries.entries, reviews.reviews, incomeMonthsLoaded, incomesComplete]
  );

  const loading = entries.loading || reviews.loading || (investmentsEnabled && deposits.loading);
  const error = entries.error ?? reviews.error ?? financeError ?? (investmentsEnabled ? deposits.error : null);
  const retry = () => {
    entries.retry();
    reviews.retry();
    retryFinanceData();
    if (investmentsEnabled) deposits.retry();
  };

  return { summary, entries: entries.entries, reviews: reviews.reviews, todayKey, loading, error, retry };
}
