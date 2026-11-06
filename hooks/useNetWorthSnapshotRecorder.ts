import { useEffect, useMemo, useRef, useState } from "react";

import { useReadModelModes } from "@/hooks/useReadModelSource";
import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { recordNetWorthSnapshot } from "@/services/netWorth/netWorthHistoryStore";
import {
  NET_WORTH_SNAPSHOT_COLLECTIONS,
  confirmSnapshotOnFirestore,
  snapshotReadsCopy,
} from "@/services/netWorth/netWorthSnapshotVerify";
import {
  hasPointOn,
  monthKeyOf,
  netWorthRecorderStatus,
  snapshotBlockers,
  type NetWorthPoint,
  type NetWorthRecorderStatus,
} from "@/shared/utils/netWorthHistory";

/** Values must hold still this long before they are recorded. */
const SETTLE_MS = 2500;
/** After a failed write, wait this long before trying again. */
const RETRY_MS = 60_000;

/**
 * SPENDLY-568 — records today's net-worth point at most once a day, from the
 * summary the dashboard already computed. Nothing is recorded until the
 * history has loaded (so we know today isn't there yet) and `snapshotBlockers`
 * is empty; the values must also stay unchanged for a moment so a late quote
 * or provider update isn't caught mid-flight.
 *
 * SPENDLY-620: returns whether today's point is saved and, if not, why — the
 * card shows it, so a blocked recorder is never silent again. A failed write
 * is retried after `RETRY_MS` instead of being given up for the session.
 */
export function useNetWorthSnapshotRecorder({
  summary,
  todayKey,
  history,
}: {
  summary: UnifiedNetWorthSummary;
  todayKey: string;
  history: { points: NetWorthPoint[]; monthIds: ReadonlySet<string>; loading: boolean; error: unknown };
}): NetWorthRecorderStatus {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const attemptedRef = useRef<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // SPENDLY-599 (R4.3a): where the history and the totals' inputs come from.
  const modes = useReadModelModes(NET_WORTH_SNAPSHOT_COLLECTIONS);
  const modesRef = useRef(modes);
  modesRef.current = modes;
  // Firestore couldn't confirm the copy yet: still "saving", tried again later.
  const [deferredKey, setDeferredKey] = useState<string | null>(null);

  const recordedToday = hasPointOn(history.points, todayKey);
  const blockers = snapshotBlockers({
    isDuress,
    isOnline,
    loading: summary.loading,
    secondaryLoading: summary.secondaryLoading,
    untrustedBalanceAccounts: summary.untrustedBalanceAccounts,
    groupFundsHeldUnknown: summary.groupFundsHeldUnknown,
    totalNetWorth: summary.totalNetWorth,
    totalAssets: summary.totalAssets,
    totalLiabilities: summary.totalLiabilities,
  });
  const blockerKey = blockers.join(",");
  const monthDocExists = history.monthIds.has(monthKeyOf(todayKey));
  const attemptKey = uid ? `${uid}:${todayKey}` : null;
  const ready =
    Boolean(uid) && !history.loading && !history.error && !recordedToday && blockers.length === 0;

  useEffect(() => {
    if (!ready || !uid || !attemptKey) return;
    if (attemptedRef.current === attemptKey) return;
    const timer = setTimeout(async () => {
      attemptedRef.current = attemptKey;
      let monthExists = monthDocExists;
      // SPENDLY-599 (R4.3a): when the history or an input comes from the
      // on-device copy, write only after Firestore confirms both.
      if (snapshotReadsCopy(modesRef.current)) {
        const verdict = await confirmSnapshotOnFirestore(uid, todayKey, modesRef.current, monthDocExists);
        if (verdict.kind === "recorded") return;
        if (verdict.kind === "unconfirmed") {
          setDeferredKey(attemptKey);
          return;
        }
        monthExists = verdict.monthDocExists;
      }
      recordNetWorthSnapshot(uid, {
        todayKey,
        totalNetWorth: summary.totalNetWorth,
        totalAssets: summary.totalAssets,
        totalLiabilities: summary.totalLiabilities,
        monthDocExists: monthExists,
      }).then(
        () => setFailedKey(null),
        (error) => {
          logError("netWorthHistory.record", error, { todayKey });
          setFailedKey(attemptKey);
        }
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, attemptKey, todayKey, monthDocExists, retryTick, summary.totalNetWorth, summary.totalAssets, summary.totalLiabilities]);

  // A failed write releases today's attempt after a pause, so the effect above
  // tries again rather than leaving the day unrecorded for the whole session.
  // An unconfirmed copy (599) waits the same way.
  const failed = failedKey !== null && failedKey === attemptKey;
  const deferred = deferredKey !== null && deferredKey === attemptKey;
  useEffect(() => {
    if (!failed && !deferred) return;
    const timer = setTimeout(() => {
      attemptedRef.current = null;
      setFailedKey(null);
      setDeferredKey(null);
      setRetryTick((n) => n + 1);
    }, RETRY_MS);
    return () => clearTimeout(timer);
  }, [failed, deferred]);

  const namesKey = JSON.stringify(summary.untrustedBalanceAccountNames);
  return useMemo(
    () => ({
      ...netWorthRecorderStatus({
        recordedToday,
        historyLoading: history.loading,
        failed,
        blockers: blockerKey ? (blockerKey.split(",") as typeof blockers) : [],
      }),
      accountNames: JSON.parse(namesKey) as string[],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys stand in for the arrays
    [recordedToday, history.loading, failed, blockerKey, namesKey]
  );
}
