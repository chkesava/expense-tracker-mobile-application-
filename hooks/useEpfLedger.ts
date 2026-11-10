/**
 * The EPF ledger rows the dashboard shows: contributions, transfers, stored
 * interest entries and reconciliations.
 *
 * SPENDLY-740 (epic SPENDLY-735): read only. Interest years, the stored EPF
 * summary and the monthly contribution catch-up are computed and written by
 * the server's `epf-daily` job (scripts/lib/epfDailyCore.ts); this hook used to
 * recompute and write interest on every ledger change (SPENDLY-71/17).
 */

import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";

export function useEpfLedger(args: { enabled?: boolean } = {}) {
  const enabled = args.enabled !== false;
  const {
    contributions,
    loading: contributionsLoading,
    error: contributionsError,
    fromCache: contributionsFromCache,
  } = useEpfAllContributions({ enabled });
  const { transfers, transfersLoading, transfersFromCache, transfersError } = useEpfTransfers({ enabled });
  const { interestEntries, reconciliations, interestLoading, reconciliationsLoading, interestFromCache, interestError } =
    useEpfInterest({ enabled });

  return {
    contributions,
    transfers,
    interestEntries,
    reconciliations,
    loading: contributionsLoading || transfersLoading || interestLoading || reconciliationsLoading,
    error: contributionsError ?? transfersError ?? interestError ?? null,
    /** True while any source is still the local cache's (possibly partial) copy. */
    fromCache: contributionsFromCache || transfersFromCache || interestFromCache,
  };
}
