import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshSponsorship } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useSponsorships(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount, retry } = useSharedOrLocalCollection<GaneshSponsorship>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    requestShared: () => data.request("sponsorships"),
    shared: data.sponsorships,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "sponsorships") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<GaneshSponsorship, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 },
  });
  return { sponsorships: items, loading, error, pendingCount, retry };
}

export function useGaneshSponsorship(
  pandalId: string | null,
  festivalId: string | null,
  sponsorshipId: string | null
) {
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const fromList = sponsorships.find((item) => item.id === sponsorshipId) ?? null;
  const [sponsorship, setSponsorship] = useState<GaneshSponsorship | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setSponsorship(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !sponsorshipId) {
      setSponsorship(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId];
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setSponsorship(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<GaneshSponsorship, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.sponsorship",
        () => setLoading(false),
        "Couldn't load sponsorship."
      )
    );
    return unsubscribe;
  }, [fromList, pandalId, festivalId, sponsorshipId]);

  return { sponsorship: fromList ?? sponsorship, loading: fromList ? false : loading };
}
