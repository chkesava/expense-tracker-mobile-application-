import { useMemo } from "react";

import { useTaxCapitalGains } from "@/hooks/useTaxCapitalGains";
import { useTaxProfile } from "@/hooks/useTaxData";
import { useTaxDeductions } from "@/hooks/useTaxDeductions";
import { useTaxIncome } from "@/hooks/useTaxIncome";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { compareRegimes } from "@/shared/features/tax/utils/compareRegimes";
import { assembleTaxInput } from "@/shared/features/tax/utils/taxInput";

/**
 * The year's informational tax estimate in both regimes (SPENDLY-295), from
 * the same resolved data the income, deductions, capital-gains, TDS and
 * payments screens show. Display only: nothing here writes, and it reads
 * through each screen's own hook and read switch (SPENDLY-406: only while the
 * estimate screen is open).
 */
export function useTaxEstimate(fy: FinancialYearKey, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const income = useTaxIncome(fy, { enabled });
  const deductions = useTaxDeductions(fy, { enabled });
  const capitalGains = useTaxCapitalGains(fy, { enabled });
  const profile = useTaxProfile(fy, { enabled });

  const input = useMemo(
    () =>
      assembleTaxInput({
        fy,
        profile: profile.profile,
        income: income.summary,
        deductions: deductions.summary,
        capitalGains: capitalGains.summary,
        entries: income.entries,
      }),
    [fy, profile.profile, income.summary, deductions.summary, capitalGains.summary, income.entries]
  );
  const comparison = useMemo(() => compareRegimes(input), [input]);

  const loading = income.loading || deductions.loading || capitalGains.loading || profile.loading;
  const error = income.error ?? deductions.error ?? capitalGains.error ?? profile.error ?? null;
  const retry = () => {
    income.retry();
    deductions.retry();
    capitalGains.retry();
    profile.retry();
  };

  return {
    input,
    comparison,
    profile: profile.profile,
    income: income.summary,
    deductions: deductions.summary,
    capitalGains: capitalGains.summary,
    entries: income.entries,
    reviews: income.reviews,
    loading,
    error,
    retry,
  };
}
