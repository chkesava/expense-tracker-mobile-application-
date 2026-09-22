/**
 * Client-side catch-up for EPF interest — SPENDLY-71 / SPENDLY-17.
 *
 * Recompute used to run only when the Balance tab mounted. A previous employer
 * opens on History, so a newly declared rate (FY 2025-26) never got written and
 * Home kept showing ₹0. Opening the EPF dashboard now recomputes every
 * establishment that has contributions or stored interest, using the same
 * idempotent `{establishmentId}_{financialYear}` writes as the Balance tab.
 *
 * A later reversal or transfer-out can drop a FY to zero. The fingerprint
 * below re-runs the write (and stale-year delete) when that establishment's
 * ledger inputs change, not only once per mount.
 */

import { useEffect, useRef } from "react";

import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";
import { logError } from "@/lib/errors";
import { interestInputSignature } from "@/shared/features/epf/utils/interest";

const CATCH_UP_DEBOUNCE_MS = 400;

export function useEpfInterestCatchUp(args: { enabled?: boolean } = {}) {
  const enabled = args.enabled !== false;
  const { contributions, loading: contributionsLoading } = useEpfAllContributions({
    enabled,
  });
  const { transfers, transfersLoading } = useEpfTransfers({ enabled });
  const {
    recomputeInterest,
    interestEntries,
    reconciliations,
    interestLoading,
  } = useEpfInterest({ enabled });

  const lastSignatures = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled) return;
    if (contributionsLoading || transfersLoading || interestLoading) return;

    const ids = [
      ...new Set([
        ...contributions.map((row) => row.establishmentId),
        ...interestEntries.map((row) => row.establishmentId),
        ...transfers.flatMap((row) => [
          row.sourceEstablishmentId,
          row.destinationEstablishmentId,
        ]),
      ]),
    ].filter(Boolean);

    const timer = setTimeout(() => {
      void (async () => {
        for (const establishmentId of ids) {
          const signature = interestInputSignature({
            establishmentId,
            contributions,
            transfers,
            reconciliations,
          });
          if (lastSignatures.current.get(establishmentId) === signature) continue;
          try {
            await recomputeInterest({
              establishmentId,
              contributions,
              transfers,
            });
            lastSignatures.current.set(establishmentId, signature);
          } catch (err) {
            logError("epf.interest.catchup", err);
          }
        }
      })();
    }, CATCH_UP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    enabled,
    contributions,
    contributionsLoading,
    transfers,
    transfersLoading,
    reconciliations,
    interestEntries,
    interestLoading,
    recomputeInterest,
  ]);
}
