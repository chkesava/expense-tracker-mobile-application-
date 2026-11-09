import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "@/lib/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
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
  // SPENDLY-599: firestore (default) | shadow | supabase, per readModel.netWorthHistory.
  // Display only: the server records the points (snapshot-daily, SPENDLY-741).
  const historySource = useReadModelSource("netWorthHistory");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${NET_WORTH_HISTORY_COLLECTION}`;
    const applyHistory = (list: SourceDoc[]) => {
      setDocs(list.map((d) => ({ id: d.id, data: d.data as Partial<NetWorthHistoryDoc> })));
      setError(null);
      setLoading(false);
    };
    if (historySource.mode === "supabase") {
      return historySource.subscribe(applyHistory, { where: (d) => String(d.data.month ?? "") >= startMonth });
    }
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, NET_WORTH_HISTORY_COLLECTION), where("month", ">=", startMonth)),
      (snap) => {
        const list = toSourceDocs(snap);
        applyHistory(list);
        // The last 12 months: older months in the copy aren't "extra".
        if (historySource.mode === "shadow") void historySource.shadow(list, { windowed: true });
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
  }, [uid, startMonth, attempt, historySource.mode]);

  const points = useMemo<NetWorthPoint[]>(() => flattenNetWorthHistory(docs), [docs]);
  const monthIds = useMemo(() => new Set(docs.map((d) => d.id)), [docs]);

  return { points, monthIds, loading, error, retry };
}
