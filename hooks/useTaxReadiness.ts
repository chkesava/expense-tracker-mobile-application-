import { useMemo } from "react";

import { useTaxEstimate } from "@/hooks/useTaxEstimate";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { assembleReadiness } from "@/shared/features/tax/utils/readiness";

/**
 * The tax center's readiness for one year (SPENDLY-296): section statuses and
 * the checklist, from the same data as the estimate. Display only; reads
 * while the tax center is open (SPENDLY-406), through each section's hooks
 * and read switches. Checklist decisions are the year's `taxReviews`.
 */
export function useTaxReadiness(fy: FinancialYearKey, options?: { enabled?: boolean }) {
  const estimate = useTaxEstimate(fy, options);
  const readiness = useMemo(
    () =>
      assembleReadiness({
        fy,
        profile: estimate.profile,
        input: estimate.input,
        comparison: estimate.comparison,
        income: estimate.income,
        deductions: estimate.deductions,
        capitalGains: estimate.capitalGains,
        entries: estimate.entries,
        reviews: estimate.reviews,
      }),
    [fy, estimate.profile, estimate.input, estimate.comparison, estimate.income, estimate.deductions, estimate.capitalGains, estimate.entries, estimate.reviews]
  );
  return { readiness, input: estimate.input, profile: estimate.profile, comparison: estimate.comparison, loading: estimate.loading, error: estimate.error, retry: estimate.retry };
}
