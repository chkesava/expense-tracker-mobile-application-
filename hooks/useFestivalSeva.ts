import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { FestivalSeva, SevaDuty } from "@/shared/types/ganesh";
import { festivalCol, sevaDutiesCol } from "@/shared/utils/ganeshPaths";

/**
 * The festival's seva schedule.
 *
 * Ordered by `date` then `startTime`, both ISO strings, so Firestore sorts them
 * chronologically without a composite index on a timestamp — see
 * `shared/utils/ganeshSeva.ts` for why the schedule avoids Date objects
 * entirely.
 */
export function useFestivalSeva(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount, retry } = useSharedOrLocalCollection<FestivalSeva>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.seva,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "seva") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<FestivalSeva, "id">),
      pendingWrite,
    }),
    query: { orderByField: "date", orderDirection: "asc", limitTo: 400 },
  });
  return { seva: items, loading, error, pendingCount, retry };
}

/** One seva, live — for the detail screen. */
export function useSeva(
  pandalId: string | null,
  festivalId: string | null,
  sevaId: string | null
) {
  const { seva: items } = useFestivalSeva(pandalId, festivalId);
  const fromList = items.find((item) => item.id === sevaId) ?? null;
  const [seva, setSeva] = useState<FestivalSeva | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setSeva(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !sevaId) {
      setSeva(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "seva"), sevaId];
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setSeva(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<FestivalSeva, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.ganesh.seva", () => setLoading(false), "Couldn't load seva.")
    );
    return unsubscribe;
  }, [fromList, pandalId, festivalId, sevaId]);

  return { seva: fromList ?? seva, loading: fromList ? false : loading };
}

/**
 * Volunteers assigned to one seva.
 *
 * A subcollection rather than an array on the seva document so two coordinators
 * staffing the same aarti do not overwrite each other.
 */
export function useSevaDuties(
  pandalId: string | null,
  festivalId: string | null,
  sevaId: string | null
) {
  const { items, loading, error, pendingCount, retry } = useGaneshCollection<SevaDuty>(
    pandalId && festivalId && sevaId ? sevaDutiesCol(pandalId, festivalId, sevaId) : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<SevaDuty, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "asc", limitTo: 200 }
  );
  return { duties: items, loading, error, pendingCount, retry };
}
