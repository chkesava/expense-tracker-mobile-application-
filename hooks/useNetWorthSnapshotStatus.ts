import { useMemo } from "react";

import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  hasPointOn,
  netWorthRecorderStatus,
  snapshotBlockers,
  type NetWorthPoint,
  type NetWorthRecorderStatus,
} from "@/shared/utils/netWorthHistory";

/**
 * SPENDLY-620 — whether today's net-worth point is saved and, if not, why;
 * the card shows it so a blocked day is never silent.
 *
 * SPENDLY-741 (epic SPENDLY-735): display only. The server's snapshot-daily
 * job records the point every morning (08:30 IST) from the same shared
 * `composeNetWorth` and `snapshotBlockers`; this hook used to record it from
 * the dashboard (SPENDLY-568) and writes nothing now.
 */
export function useNetWorthSnapshotStatus({
  summary,
  todayKey,
  history,
}: {
  summary: UnifiedNetWorthSummary;
  todayKey: string;
  history: { points: NetWorthPoint[]; loading: boolean };
}): NetWorthRecorderStatus {
  const { isDuress } = useAuth();
  const { isOnline } = useNetwork();
  const recordedToday = hasPointOn(history.points, todayKey);
  const blockerKey = snapshotBlockers({
    isDuress,
    isOnline,
    loading: summary.loading,
    secondaryLoading: summary.secondaryLoading,
    untrustedBalanceAccounts: summary.untrustedBalanceAccounts,
    groupFundsHeldUnknown: summary.groupFundsHeldUnknown,
    totalNetWorth: summary.totalNetWorth,
    totalAssets: summary.totalAssets,
    totalLiabilities: summary.totalLiabilities,
  }).join(",");
  const namesKey = JSON.stringify(summary.untrustedBalanceAccountNames);
  return useMemo(
    () => ({
      ...netWorthRecorderStatus({
        recordedToday,
        historyLoading: history.loading,
        failed: false,
        blockers: blockerKey ? (blockerKey.split(",") as Parameters<typeof netWorthRecorderStatus>[0]["blockers"]) : [],
      }),
      accountNames: JSON.parse(namesKey) as string[],
    }),
    [recordedToday, history.loading, blockerKey, namesKey]
  );
}
