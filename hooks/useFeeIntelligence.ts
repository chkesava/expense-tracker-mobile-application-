import { useEffect, useMemo, useState } from "react";
import { InteractionManager } from "react-native";

import { useFeeReviews } from "@/hooks/useFeeReviews";
import { useAuth } from "@/providers/AuthProvider";
import {
  useAccountsContext,
  useExpensesContext,
  useIncomesContext,
} from "@/providers/FinanceDataProvider";
import type { FeeReview } from "@/shared/types/fee";
import {
  createFeeDetectionCache,
  detectFees,
  type FeeDetectionCache,
  type FeeDetectionResult,
} from "@/shared/utils/feeDetection";

/**
 * Fee records for the signed-in user (SPENDLY-315): the detection engine over
 * the ledger already in memory, folded with the user's reviews.
 *
 * Performance:
 *   - Runs only once the full expense and income history has loaded
 *     (`expensesComplete` / `incomesComplete`) — a fee total over the staged
 *     300-row page would be quietly wrong.
 *   - Runs after interactions, so opening the screen is never blocked by it.
 *   - One detection cache per uid for the session, so moving between fee
 *     surfaces or receiving one new SMS re-reads only changed rows.
 */

const caches = new Map<string, FeeDetectionCache>();

function cacheFor(uid: string): FeeDetectionCache {
  let cache = caches.get(uid);
  if (!cache) {
    cache = createFeeDetectionCache();
    caches.set(uid, cache);
  }
  return cache;
}

export interface FeeIntelligence {
  result: FeeDetectionResult | null;
  reviews: FeeReview[];
  reviewById: Map<string, FeeReview>;
  /** True until history, reviews and the first detection pass are ready. */
  loading: boolean;
  error: { message: string; retryable: boolean } | null;
  retry: () => void;
}

export function useFeeIntelligence(options?: { enabled?: boolean }): FeeIntelligence {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const { expenses, expensesComplete, financeError: expensesError } = useExpensesContext();
  const { incomes, incomesComplete } = useIncomesContext();
  const { accounts, entries } = useAccountsContext();
  const { reviews, loading: reviewsLoading, error: reviewsError, retry } = useFeeReviews({ enabled });

  const [result, setResult] = useState<FeeDetectionResult | null>(null);
  const historyReady = expensesComplete && incomesComplete;

  useEffect(() => {
    if (!enabled || !uid || !historyReady || reviewsLoading) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const next = detectFees({ expenses, incomes, entries, accounts, reviews, cache: cacheFor(uid) });
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [enabled, uid, historyReady, reviewsLoading, expenses, incomes, entries, accounts, reviews]);

  // A different user must never see the previous user's records.
  useEffect(() => {
    setResult(null);
  }, [uid]);

  const reviewById = useMemo(() => new Map(reviews.map((r) => [r.id, r] as const)), [reviews]);
  const failure = expensesError ?? reviewsError;

  return {
    result,
    reviews,
    reviewById,
    loading: enabled && !failure && (!historyReady || reviewsLoading || result === null),
    error: failure ? { message: failure.message, retryable: failure.retryable } : null,
    retry,
  };
}
