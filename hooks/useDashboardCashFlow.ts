import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, onSnapshot, type Firestore } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { logWarning } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenses } from "@/hooks/useExpenses";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logDirectRead, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { cashFlowMonths, readCashFlowHistory, shadowCompareCashFlow } from "@/lib/readModel/analyticsReadPath";
import type { CashFlowMonth } from "@/lib/readModel/analyticsSources";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

const toChartMonth = (s: DashboardPeriodSummary): CashFlowMonth => ({
  period: s.period,
  totalExpenses: s.totalExpenses,
  totalIncome: s.totalIncome,
  transactionCount: s.transactionCount,
});

/** The `dashboard_*` summary docs for `fromMonth`..`toMonth`, read once (the read-model fallback). */
async function readSummaryDocs(db: Firestore, uid: string, fromMonth: string, toMonth: string): Promise<CashFlowMonth[]> {
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "financialSummaries"),
      where("__name__", ">=", `dashboard_${fromMonth}`),
      where("__name__", "<=", `dashboard_${toMonth}`)
    )
  );
  logDirectRead(`users/${uid}/financialSummaries`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
    feature: "dashboard",
    queryShape: `dashboard ${fromMonth}..${toMonth} (read-model fallback)`,
  });
  return snap.docs.filter((d) => d.id.startsWith("dashboard_")).map((d) => toChartMonth(d.data() as DashboardPeriodSummary));
}

/**
 * One listener over the last `count` dashboard period summaries, ending at
 * `activeMonth`. The Dashboard reads its current and previous month from this
 * same window (SPENDLY-532), so it needs no per-month doc listeners.
 *
 * SPENDLY-513, under `system_settings/global.readModel.cashFlow`:
 * - `firestore` (default): exactly the above; `chartMonths` are the summaries.
 * - `shadow`: the same, and the chart's months are compared with the read
 *   model (`v_cash_flow_by_month`) in the background.
 * - `supabase`: the listener covers only the current and previous month (the
 *   tiles stay on Firestore until Phase 4); the chart's older months come
 *   from the read model, or on failure from one bounded read of the same
 *   summary docs.
 */
export function useDashboardCashFlow(activeMonth: string, count: number = 6) {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { readModelSession } = useExpenses();
  const { settings } = useSystemSettings();
  const configured = configuredReadModelMode(settings.readModel, "cashFlow");
  const splitOlder = configured === "supabase" && count > 2;
  const listenCount = splitOlder ? 2 : count;
  const [summaries, setSummaries] = useState<DashboardPeriodSummary[]>([]);
  const [older, setOlder] = useState<{ key: string; months: CashFlowMonth[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db || !activeMonth) {
      setSummaries([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const startMonth = shiftMonthKey(activeMonth, -(listenCount - 1));
    const path = `users/${uid}/financialSummaries`;

    const ref = collection(db, "users", uid, "financialSummaries");
    const q = query(
      ref,
      where("__name__", ">=", `dashboard_${startMonth}`),
      where("__name__", "<=", `dashboard_${activeMonth}`)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot, {
          feature: "dashboard",
          queryShape: `dashboard ${startMonth}..${activeMonth}`,
        });
        const results: DashboardPeriodSummary[] = [];
        snapshot.forEach(doc => {
          if (doc.id.startsWith("dashboard_")) {
            results.push(doc.data() as DashboardPeriodSummary);
          }
        });

        results.sort((a, b) => b.period.localeCompare(a.period));
        setSummaries(results);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.dashboardCashFlow",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load cash flow."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, activeMonth, listenCount]);

  // supabase: the chart's older months.
  const olderKey = `${uid}|${activeMonth}|${count}`;
  useEffect(() => {
    const db = getFirestoreDb();
    if (!splitOlder || !user || !db || !activeMonth) return;
    let cancelled = false;
    const fromMonth = shiftMonthKey(activeMonth, -(count - 1));
    const toMonth = shiftMonthKey(activeMonth, -2);
    readCashFlowHistory({
      db,
      user,
      conditions: readModelSession.conditions(),
      fromMonth,
      toMonth,
      firestore: () => readSummaryDocs(db, user.uid, fromMonth, toMonth),
    })
      .then(async (result) => {
        // null: the read model isn't usable here (offline, duress, no read
        // model), so read the same summary docs once.
        const months = result ? result.months : await readSummaryDocs(db, user.uid, fromMonth, toMonth);
        if (!cancelled) setOlder({ key: olderKey, months });
      })
      .catch((failure) => logWarning("readModel.cashFlow", failure));
    return () => {
      cancelled = true;
    };
  }, [splitOlder, user, activeMonth, count, olderKey, readModelSession, isDuress]);

  // shadow: compare what the chart shows with the read model.
  useEffect(() => {
    const db = getFirestoreDb();
    if (configured !== "shadow" || !user || !db || loading) return;
    void shadowCompareCashFlow({
      db,
      user,
      conditions: readModelSession.conditions(),
      shown: summaries.map(toChartMonth),
      months: cashFlowMonths(activeMonth, count, shiftMonthKey),
    }).catch((failure) => logWarning("readModel.shadow.cashFlow.error", failure));
  }, [configured, user, loading, summaries, activeMonth, count, readModelSession]);

  const chartMonths = useMemo(() => {
    const recent = summaries.map(toChartMonth);
    if (!splitOlder || older?.key !== olderKey) return recent;
    return [...recent, ...older.months].sort((a, b) => b.period.localeCompare(a.period));
  }, [summaries, splitOlder, older, olderKey]);

  return { summaries, chartMonths, loading, error };
}
