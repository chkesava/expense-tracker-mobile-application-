import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { doc } from "firebase/firestore";

import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { summaryDoc } from "@/shared/utils/ganeshPaths";
import { EMPTY_GANESH_SUMMARY, type GaneshSummary } from "@/shared/types/ganesh";

/**
 * The festival summary document: the single source of truth for every displayed
 * balance, the God Fund spend guard and the settlement figure.
 *
 * It initialises to all zeros, so `summary` alone cannot tell "the festival has
 * no money" apart from "the snapshot has not arrived" or "the listener failed".
 * Any screen that acts on a balance — settlement above all — must consult
 * `loading` and `error` before treating a zero as fact (GS-007, GS-032).
 */
export function useGaneshSummary(pandalId: string | null, festivalId: string | null) {
  const [summary, setSummary] = useState<GaneshSummary>(EMPTY_GANESH_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [pendingWrite, setPendingWrite] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId) {
      setSummary(EMPTY_GANESH_SUMMARY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [root, ...rest] = summaryDoc(pandalId, festivalId);
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setSummary(
          snap.exists()
            ? { ...EMPTY_GANESH_SUMMARY, ...(snap.data() as Partial<GaneshSummary>) }
            : EMPTY_GANESH_SUMMARY
        );
        setPendingWrite(snap.metadata.hasPendingWrites);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.summary",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load totals."
      )
    );
    return unsubscribe;
  }, [pandalId, festivalId, attempt, setError]);

  return { summary, loading, pendingWrite, error, retry };
}
