import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { doc } from "firebase/firestore";

import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { summaryDoc } from "@/shared/utils/ganeshPaths";
import { EMPTY_GANESH_SUMMARY, type GaneshSummary } from "@/shared/types/ganesh";

export function useGaneshSummary(pandalId: string | null, festivalId: string | null) {
  const [summary, setSummary] = useState<GaneshSummary>(EMPTY_GANESH_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [pendingWrite, setPendingWrite] = useState(false);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId) {
      setSummary(EMPTY_GANESH_SUMMARY);
      setLoading(false);
      return;
    }
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
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.ganesh.summary", () => setLoading(false), "Couldn't load totals.")
    );
    return unsubscribe;
  }, [pandalId, festivalId]);

  return { summary, loading, pendingWrite };
}
