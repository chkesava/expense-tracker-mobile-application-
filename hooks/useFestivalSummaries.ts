import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { EMPTY_GANESH_SUMMARY, type GaneshSummary } from "@/shared/types/ganesh";
import { summaryDoc } from "@/shared/utils/ganeshPaths";

export function useFestivalSummaries(pandalId: string | null, festivalIds: string[]) {
  const [summaries, setSummaries] = useState<Record<string, GaneshSummary>>({});
  const idsKey = festivalIds.join("|");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || festivalIds.length === 0) {
      setSummaries({});
      return;
    }
    const paths = festivalIds.map((festivalId) => summaryDoc(pandalId, festivalId).join("/"));
    const unsubs = festivalIds.map((festivalId, index) => {
      const [root, ...rest] = summaryDoc(pandalId, festivalId);
      const path = paths[index]!;
      return onSnapshot(doc(db, root, ...rest), (snap) => {
        logQuerySnapshot(path, snap);
        setSummaries((prev) => ({
          ...prev,
          [festivalId]: snap.exists()
            ? { ...EMPTY_GANESH_SUMMARY, ...(snap.data() as Partial<GaneshSummary>) }
            : EMPTY_GANESH_SUMMARY,
        }));
      });
    });
    return () => {
      paths.forEach((path) => forgetSnapshotPath(path));
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [pandalId, idsKey]);

  return { summaries };
}
