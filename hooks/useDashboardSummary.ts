import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";


export function useDashboardSummary(month: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summary, setSummary] = useState<DashboardPeriodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db || !month) {
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const path = `users/${uid}/financialSummaries/dashboard_${month}`;
    const ref = doc(db, "users", uid, "financialSummaries", `dashboard_${month}`);

    const unsubscribe = onSnapshot(
      ref,
      (docSnap) => {
        if (docSnap.exists()) {
          setSummary(docSnap.data() as DashboardPeriodSummary);
        } else {
          setSummary(null);
        }
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.dashboardSummary",
        (err) => setError(err as unknown as Error),
        "Couldn't load dashboard summary."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, month]);

  return { summary, loading, error };
}
