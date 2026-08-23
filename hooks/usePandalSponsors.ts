import { useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import type { GaneshSponsorship, PandalSponsor, PandalSponsorAudit } from "@/shared/types/ganesh";
import { festivalCol, pandalSponsorAuditsCol, pandalSponsorsCol } from "@/shared/utils/ganeshPaths";

export function usePandalSponsors(pandalId: string | null) {
  const { items, loading, error, pendingCount, retry } = useGaneshCollection<PandalSponsor>(
    pandalId ? pandalSponsorsCol(pandalId) : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<PandalSponsor, "id">),
      pendingWrite,
    }),
    { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 }
  );
  return { sponsors: items, loading, error, pendingCount, retry };
}

export function usePandalSponsor(pandalId: string | null, sponsorId: string | null) {
  const [sponsor, setSponsor] = useState<PandalSponsor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !sponsorId) {
      setSponsor(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...pandalSponsorsCol(pandalId), sponsorId];
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setSponsor(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<PandalSponsor, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.sponsor",
        () => setLoading(false),
        "Couldn't load sponsor."
      )
    );
    return unsubscribe;
  }, [pandalId, sponsorId]);

  return { sponsor, loading };
}

export function usePandalSponsorAudits(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<PandalSponsorAudit>(
    pandalId ? pandalSponsorAuditsCol(pandalId) : null,
    (id, data) => ({
      id,
      ...(data as Omit<PandalSponsorAudit, "id">),
    }),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  return { audits: items, loading, error };
}

export function useSponsorHistory(
  pandalId: string | null,
  sponsorId: string | null,
  festivalIds: string[]
) {
  const [rows, setRows] = useState<Array<GaneshSponsorship & { festivalId: string }>>([]);
  const [loading, setLoading] = useState(false);
  const festivalKey = festivalIds.join(",");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !sponsorId || festivalIds.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      festivalIds.map(async (festivalId) => {
        const [root, ...rest] = festivalCol(pandalId, festivalId, "sponsorships");
        const snap = await getDocs(collection(db, root, ...rest));
        return snap.docs
          .filter((docSnap) => String(docSnap.data().sponsorId ?? "") === sponsorId)
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<GaneshSponsorship, "id">),
            festivalId,
          }));
      })
    )
      .then((groups) => {
        if (!cancelled) setRows(groups.flat());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [festivalKey, pandalId, sponsorId]);

  return { history: rows, loading };
}
