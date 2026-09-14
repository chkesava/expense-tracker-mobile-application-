/**
 * Client-side catch-up for EPF interest — SPENDLY-71.
 *
 * Recompute used to run only when the Balance tab mounted. A previous employer
 * opens on History, so a newly declared rate (FY 2025-26) never got written and
 * Home kept showing ₹0. Opening the EPF dashboard now recomputes every
 * establishment that has contributions, using the same idempotent
 * `{establishmentId}_{financialYear}` writes as the Balance tab.
 */

import { useEffect, useRef } from "react";

import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";
import { logError } from "@/lib/errors";

export function useEpfInterestCatchUp(args: { enabled?: boolean } = {}) {
  const enabled = args.enabled !== false;
  const { contributions, loading: contributionsLoading } = useEpfAllContributions({
    enabled,
  });
  const { transfers, transfersLoading } = useEpfTransfers({ enabled });
  const { recomputeInterest, interestLoading } = useEpfInterest({ enabled });

  // One attempt per establishment per mount. The write itself triggers a
  // snapshot; without this the effect would loop.
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    if (contributionsLoading || transfersLoading || interestLoading) return;

    const ids = [...new Set(contributions.map((row) => row.establishmentId))];

    void (async () => {
      for (const establishmentId of ids) {
        if (attempted.current.has(establishmentId)) continue;
        attempted.current.add(establishmentId);
        try {
          await recomputeInterest({
            establishmentId,
            contributions,
            transfers,
          });
        } catch (err) {
          logError("epf.interest.catchup", err);
        }
      }
    })();
  }, [
    enabled,
    contributions,
    contributionsLoading,
    transfers,
    transfersLoading,
    interestLoading,
    recomputeInterest,
  ]);
}
