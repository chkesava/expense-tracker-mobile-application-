import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";

export function useDashboardCashFlow(activeMonth: string, count: number = 6) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summaries, setSummaries] = useState<DashboardPeriodSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db || !activeMonth) {
      setSummaries([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const startMonth = shiftMonthKey(activeMonth, -(count - 1));

    const ref = collection(db, "users", uid, "financialSummaries");
    const q = query(
      ref,
      where("__name__", ">=", `dashboard_${startMonth}`),
      where("__name__", "<=", `dashboard_${activeMonth}`)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const results: DashboardPeriodSummary[] = [];
        snapshot.forEach(doc => {
          if (doc.id.startsWith("dashboard_")) {
            results.push(doc.data() as DashboardPeriodSummary);
          }
        });
        
        results.sort((a, b) => b.period.localeCompare(a.period));
        setSummaries(results);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.dashboardCashFlow",
        () => setLoading(false),
        "Couldn't load cash flow."
      )
    );

    return () => unsubscribe();
  }, [uid, activeMonth, count]);

  return { summaries, loading };
}
