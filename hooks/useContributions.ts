import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshContribution } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useContributions(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount } = useSharedOrLocalCollection<GaneshContribution>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.contributions,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "contributions") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<GaneshContribution, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 },
  });
  return { contributions: items, loading, error, pendingCount };
}

export function useGaneshContribution(
  pandalId: string | null,
  festivalId: string | null,
  contributionId: string | null
) {
  const { contributions } = useContributions(pandalId, festivalId);
  const fromList = contributions.find((item) => item.id === contributionId) ?? null;
  const [contribution, setContribution] = useState<GaneshContribution | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setContribution(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !contributionId) {
      setContribution(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "contributions"), contributionId];
    setLoading(true);
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
  }, [fromList, pandalId, festivalId, contributionId]);

  return { contribution: fromList ?? contribution, loading: fromList ? false : loading };
}
