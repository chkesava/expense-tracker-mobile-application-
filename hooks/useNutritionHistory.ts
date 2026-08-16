import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { DailyLogSummary } from "@/shared/types/nutrition";

export function useNutritionHistory(days = 7) {
  const { user } = useAuth();
  const db = getFirestoreDb();
  const [logs, setLogs] = useState<DailyLogSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setLogs([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(
          query(
            collection(db, `users/${user.uid}/daily_logs`),
            orderBy("date", "desc"),
            limit(days)
          )
        );
        if (cancelled) return;
        const fetched = snapshot.docs.map((item) => ({
          date: item.id,
          ...(item.data() as Omit<DailyLogSummary, "date">),
        }));
        setLogs(fetched.reverse());
      } catch (error) {
        logError("nutrition.history.fetch", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [user, db, days]);

  return { logs, loading };
}
