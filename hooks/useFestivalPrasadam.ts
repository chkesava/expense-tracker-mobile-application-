import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import { festivalCol } from "@/shared/utils/ganeshPaths";

/**
 * The festival's prasadam register (KAN-126).
 *
 * One listener over the whole collection, ordered by `date` alone. Every other
 * dimension the screens filter on — session, provider, prasadam type, status —
 * is applied in memory by `filterPrasadam`, because a query of the form
 * `where('session','==',x) + orderBy('date')` would need a composite index, and
 * `firestore.indexes.json` is a strict subset of the live project: deploying it
 * deletes anything absent (`docs/KAN-75-epf-index-query-review.md`).
 *
 * The 1000 cap is a runaway guard rather than pagination. A festival is
 * ~11 days x 2 sessions x a few dozen providers, so it sits well inside it. The
 * export deliberately reads this same in-memory list, so a report can never
 * claim more completeness than the listener actually has.
 */
export function useFestivalPrasadam(
  pandalId: string | null,
  festivalId: string | null
) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount, retry } =
    useSharedOrLocalCollection<PrasadamEntry>({
      useShared:
        Boolean(pandalId && festivalId) &&
        pandalId === data.sessionPandalId &&
        festivalId === data.sessionFestivalId,
      shared: data.prasadam,
      path:
        pandalId && festivalId
          ? festivalCol(pandalId, festivalId, "prasadamEntries")
          : null,
      mapDoc: (id, docData, pendingWrite) => ({
        id,
        ...(docData as Omit<PrasadamEntry, "id">),
        pendingWrite,
      }),
      query: { orderByField: "date", orderDirection: "desc", limitTo: 1000 },
    });
  return { entries: items, loading, error, pendingCount, retry };
}

/** One entry, live — for the detail screen. */
export function usePrasadamEntry(
  pandalId: string | null,
  festivalId: string | null,
  entryId: string | null
) {
  const { entries } = useFestivalPrasadam(pandalId, festivalId);
  const fromList = entries.find((item) => item.id === entryId) ?? null;
  const [entry, setEntry] = useState<PrasadamEntry | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setEntry(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !entryId) {
      setEntry(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [
      ...festivalCol(pandalId, festivalId, "prasadamEntries"),
      entryId,
    ];
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setEntry(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<PrasadamEntry, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.prasadam",
        () => setLoading(false),
        "Couldn't load this prasadam entry."
      )
    );
    return unsubscribe;
  }, [fromList, pandalId, festivalId, entryId]);

  return { entry: fromList ?? entry, loading: fromList ? false : loading };
}
