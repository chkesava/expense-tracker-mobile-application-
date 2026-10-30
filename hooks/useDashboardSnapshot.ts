import { useEffect, useState } from "react";

import { loadDashboardSnapshot, saveDashboardSnapshot } from "@/lib/dashboardSnapshotStore";
import { useAuth } from "@/providers/AuthProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import {
  buildDashboardSnapshot,
  type DashboardSnapshot,
  type SnapshotNetWorth,
} from "@/shared/utils/dashboardSnapshot";

/** Live values must hold still this long before they are saved. */
const SAVE_SETTLE_MS = 2000;

/**
 * SPENDLY-632 — loads the "last seen dashboard" for this user and month once,
 * and saves the live figures again once they have settled. Duress sessions
 * neither read nor write it. The caller decides, section by section, whether
 * to show it (only while that section's live data is still loading).
 */
export function useDashboardSnapshot(input: {
  month: string;
  summaries: readonly DashboardPeriodSummary[];
  summariesSettled: boolean;
  netWorth: SnapshotNetWorth;
  netWorthSettled: boolean;
}): DashboardSnapshot | null {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { month, summaries, summariesSettled, netWorth, netWorthSettled } = input;
  const [loaded, setLoaded] = useState<{ key: string; snapshot: DashboardSnapshot | null } | null>(null);
  const key = `${uid ?? ""}|${month}|${isDuress ? "d" : ""}`;

  useEffect(() => {
    let cancelled = false;
    void loadDashboardSnapshot({ uid, isDuress, month, nowMs: Date.now() }).then((snapshot) => {
      if (!cancelled) setLoaded({ key, snapshot });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, isDuress, month, key]);

  useEffect(() => {
    const snapshot = buildDashboardSnapshot({
      uid,
      isDuress,
      month,
      nowMs: Date.now(),
      summaries,
      summariesSettled,
      netWorth,
      netWorthSettled,
    });
    if (!snapshot) return;
    const timer = setTimeout(() => void saveDashboardSnapshot(snapshot), SAVE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [uid, isDuress, month, summaries, summariesSettled, netWorth, netWorthSettled]);

  return loaded?.key === key ? loaded.snapshot : null;
}
