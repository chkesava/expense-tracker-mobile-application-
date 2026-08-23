import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
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
    const unsubs = festivalIds.map((festivalId) => {
      const [root, ...rest] = summaryDoc(pandalId, festivalId);
      return onSnapshot(doc(db, root, ...rest), (snap) => {
        setSummaries((prev) => ({
          ...prev,
          [festivalId]: snap.exists()
            ? { ...EMPTY_GANESH_SUMMARY, ...(snap.data() as Partial<GaneshSummary>) }
            : EMPTY_GANESH_SUMMARY,
        }));
      });
    });
    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [pandalId, idsKey]);

  return { summaries };
}
