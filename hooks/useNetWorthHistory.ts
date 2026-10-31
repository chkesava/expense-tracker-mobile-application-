import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "@/lib/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useAuth } from "@/providers/AuthProvider";
import {
  NET_WORTH_HISTORY_COLLECTION,
  flattenNetWorthHistory,
  historyStartMonth,
  type NetWorthHistoryDoc,
  type NetWorthPoint,
} from "@/shared/utils/netWorthHistory";

/**
 * SPENDLY-568 — the last 12 months of net-worth history: at most 12 month
 * documents. Mounted only where the trend renders (the dashboard net-worth
 * card), per the SPENDLY-406 standard; duress-aware uid like every personal
 * listener.
 */
export function useNetWorthHistory(todayKey: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const startMonth = historyStartMonth(todayKey);
  const [docs, setDocs] = useState<{ id: string; data: Partial<NetWorthHistoryDoc> }[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${NET_WORTH_HISTORY_COLLECTION}`;
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, NET_WORTH_HISTORY_COLLECTION), where("month", ">=", startMonth)),
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() as Partial<NetWorthHistoryDoc> })));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.netWorthHistory",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your net-worth history."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, startMonth, attempt]);

  const points = useMemo<NetWorthPoint[]>(() => flattenNetWorthHistory(docs), [docs]);
  const monthIds = useMemo(() => new Set(docs.map((d) => d.id)), [docs]);

  return { points, monthIds, loading, error, retry };
}
