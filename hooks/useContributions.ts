import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshContribution } from "@/shared/types/ganesh";

export function useContributions(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshContribution>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "contributions") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshContribution, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { contributions: items, loading, error, pendingCount };
}

export function useGaneshContribution(
  pandalId: string | null,
  festivalId: string | null,
  contributionId: string | null
) {
  const [contribution, setContribution] = useState<GaneshContribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !contributionId) {
      setContribution(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "contributions"), contributionId];
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setContribution(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<GaneshContribution, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.contribution",
        () => setLoading(false),
        "Couldn't load contribution."
      )
    );
    return unsubscribe;
  }, [pandalId, festivalId, contributionId]);

  return { contribution, loading };
}
