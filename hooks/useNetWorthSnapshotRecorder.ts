import { useEffect, useRef } from "react";

import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { recordNetWorthSnapshot } from "@/services/netWorth/netWorthHistoryStore";
import {
  hasPointOn,
  monthKeyOf,
  snapshotBlockers,
  type NetWorthPoint,
} from "@/shared/utils/netWorthHistory";

/** Values must hold still this long before they are recorded. */
const SETTLE_MS = 2500;

/**
 * SPENDLY-568 — records today's net-worth point at most once a day, from the
 * summary the dashboard already computed. Nothing is recorded until the
 * history has loaded (so we know today isn't there yet) and `snapshotBlockers`
 * is empty; the values must also stay unchanged for a moment so a late quote
 * or provider update isn't caught mid-flight. One attempt per day per session.
 */
export function useNetWorthSnapshotRecorder({
  summary,
  todayKey,
  history,
}: {
  summary: UnifiedNetWorthSummary;
  todayKey: string;
  history: { points: NetWorthPoint[]; monthIds: ReadonlySet<string>; loading: boolean; error: unknown };
}) {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const attemptedRef = useRef<string | null>(null);

  const recordedToday = hasPointOn(history.points, todayKey);
  const blocked =
    snapshotBlockers({
      isDuress,
      isOnline,
      loading: summary.loading,
      secondaryLoading: summary.secondaryLoading,
      holdingsMissingQuote: summary.holdingsMissingQuote,
      liquidBalanceMayBePartial: summary.liquidBalanceMayBePartial,
      totalNetWorth: summary.totalNetWorth,
      totalAssets: summary.totalAssets,
      totalLiabilities: summary.totalLiabilities,
    }).length > 0;
  const monthDocExists = history.monthIds.has(monthKeyOf(todayKey));
  const ready = Boolean(uid) && !history.loading && !history.error && !recordedToday && !blocked;

  useEffect(() => {
    if (!ready || !uid) return;
    const attemptKey = `${uid}:${todayKey}`;
    if (attemptedRef.current === attemptKey) return;
    const timer = setTimeout(() => {
      attemptedRef.current = attemptKey;
      recordNetWorthSnapshot(uid, {
        todayKey,
        totalNetWorth: summary.totalNetWorth,
        totalAssets: summary.totalAssets,
        totalLiabilities: summary.totalLiabilities,
        monthDocExists,
      }).catch((error) => logError("netWorthHistory.record", error, { todayKey }));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, todayKey, monthDocExists, summary.totalNetWorth, summary.totalAssets, summary.totalLiabilities]);
}
