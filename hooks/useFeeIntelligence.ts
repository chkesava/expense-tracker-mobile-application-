import { useMemo } from "react";

import { useFeeReviews } from "@/hooks/useFeeReviews";
import { useServerResults } from "@/hooks/useServerResults";
import type { FeeReview } from "@/shared/types/fee";
import { resolveFeeRows, type FeeDetectionResult } from "@/shared/utils/feeDetection";
import { feeRowSetFromDocs } from "@/shared/utils/serverResults";

/**
 * Fee records for the signed-in user (SPENDLY-315), folded with the user's
 * reviews.
 *
 * SPENDLY-747 (epic SPENDLY-735): the full-ledger scan runs on the server
 * (insights-daily stores the fee rows at users/{uid}/serverResults). Here the
 * stored rows are only paired and resolved with the user's current reviews,
 * so a review shows at once, with no ledger scan on the phone. Before the
 * server has stored a result, there are no records (`computedAt` is null).
 */

export interface FeeIntelligence {
  result: FeeDetectionResult | null;
  reviews: FeeReview[];
  reviewById: Map<string, FeeReview>;
  /** When the server computed the rows (its run id), or null before the first run. */
  computedAt: string | null;
  /** True until the stored rows and the reviews have loaded. */
  loading: boolean;
  error: { message: string; retryable: boolean } | null;
  retry: () => void;
}

const NO_ROWS = { rows: [], scanned: 0, reclassified: 0 };

export function useFeeIntelligence(options?: { enabled?: boolean }): FeeIntelligence {
  const enabled = options?.enabled !== false;
  const { docs, loading: resultsLoading, error: resultsError, retry: retryResults } = useServerResults({ enabled });
  const { reviews, loading: reviewsLoading, error: reviewsError, retry: retryReviews } = useFeeReviews({ enabled });

  const stored = useMemo(() => (docs ? feeRowSetFromDocs(docs) : null), [docs]);
  const result = useMemo(
    () => (docs && !reviewsLoading ? resolveFeeRows(stored ?? NO_ROWS, reviews) : null),
    [docs, stored, reviews, reviewsLoading]
  );
  const reviewById = useMemo(() => new Map(reviews.map((r) => [r.id, r] as const)), [reviews]);
  const failure = resultsError ?? reviewsError;

  return {
    result,
    reviews,
    reviewById,
    computedAt: stored?.runId ?? null,
    loading: enabled && !failure && (resultsLoading || reviewsLoading || (docs !== null && result === null)),
    error: failure ? { message: failure.message, retryable: failure.retryable } : null,
    retry: () => {
      retryResults();
      retryReviews();
    },
  };
}
