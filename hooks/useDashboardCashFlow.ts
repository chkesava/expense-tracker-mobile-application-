import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";

/**
 * One listener over the last `count` dashboard period summaries, ending at
 * `activeMonth`. The Dashboard reads its current and previous month from this
 * same window (SPENDLY-532), so it needs no per-month doc listeners.
 */
export function useDashboardCashFlow(activeMonth: string, count: number = 6) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summaries, setSummaries] = useState<DashboardPeriodSummary[]>([]);
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

    const startMonth = shiftMonthKey(activeMonth, -(count - 1));
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
  }, [uid, activeMonth, count]);

  return { summaries, loading, error };
}
