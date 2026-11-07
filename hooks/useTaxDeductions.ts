import { useMemo } from "react";

import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useInvestments } from "@/hooks/useInvestments";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useTaxEntries, useTaxReviews } from "@/hooks/useTaxData";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { assembleTaxDeductions } from "@/shared/features/tax/utils/deductions";

/**
 * The year's deductions (SPENDLY-292): the EPF employee share from the user's
 * EPF records, and their own claims and eligibility confirmations.
 *
 * Reads only while the deductions screen is open (SPENDLY-406): EPF
 * contributions through their own switch (display only, `readFrom: "copy"`,
 * because decisions re-check Firestore before writing, R4.3a), investments for
 * linking a claim, and the year's tax entries and reviews.
 */
export function useTaxDeductions(fy: FinancialYearKey, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const entries = useTaxEntries(fy, { enabled });
  const reviews = useTaxReviews(fy, { enabled });
  const epf = useEpfAllContributions({ enabled, readFrom: "copy" });
  const investmentsEnabled = useInvestmentsEnabled();
  const investments = useInvestments({ enabled: enabled && investmentsEnabled });

  const summary = useMemo(
    () => assembleTaxDeductions({ fy, entries: entries.entries, reviews: reviews.reviews, contributions: epf.contributions }),
    [fy, entries.entries, reviews.reviews, epf.contributions]
  );

  /** Spendly records a claim can be based on, as `"{kind}:{id}"`. */
  const sourceOptions = useMemo(
    () =>
      (investmentsEnabled ? investments.investments : [])
        .filter((inv) => inv.status !== "closed")
        .map((inv) => ({ id: `investment:${inv.id}`, label: inv.name || "Investment" })),
    [investments.investments, investmentsEnabled]
  );

  const loading = entries.loading || reviews.loading || epf.loading;
  const error = entries.error ?? reviews.error ?? epf.error ?? null;
  const retry = () => {
    entries.retry();
    reviews.retry();
    epf.retry();
  };

  return { summary, entries: entries.entries, sourceOptions, loading, error, retry };
}
