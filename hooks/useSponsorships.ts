import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import type { GaneshSponsorship } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useSponsorships(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount, retry } = useGaneshCollection<GaneshSponsorship>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "sponsorships") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshSponsorship, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { sponsorships: items, loading, error, pendingCount, retry };
}

export function useGaneshSponsorship(
  pandalId: string | null,
  festivalId: string | null,
  sponsorshipId: string | null
) {
  const [sponsorship, setSponsorship] = useState<GaneshSponsorship | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !sponsorshipId) {
      setSponsorship(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "sponsorships"), sponsorshipId];
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
  }, [pandalId, festivalId, sponsorshipId]);

  return { sponsorship, loading };
}
