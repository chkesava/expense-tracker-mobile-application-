import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import { loadSponsorHistory } from "@/services/ganesh/ganeshSponsorHistory";
import type { GaneshSponsorship, PandalSponsor, PandalSponsorAudit } from "@/shared/types/ganesh";
import { pandalSponsorAuditsCol, pandalSponsorsCol } from "@/shared/utils/ganeshPaths";

export function usePandalSponsors(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount, retry } = useSharedOrLocalCollection<PandalSponsor>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("sponsors"),
    shared: data.sponsors,
    path: pandalId ? pandalSponsorsCol(pandalId) : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PandalSponsor, "id">),
      pendingWrite,
    }),
    query: { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 },
  });
  return { sponsors: items, loading, error, pendingCount, retry };
}

export function usePandalSponsor(pandalId: string | null, sponsorId: string | null) {
  const { sponsors } = usePandalSponsors(pandalId);
  const fromList = sponsors.find((item) => item.id === sponsorId) ?? null;
  const [sponsor, setSponsor] = useState<PandalSponsor | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setSponsor(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !sponsorId) {
      setSponsor(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...pandalSponsorsCol(pandalId), sponsorId];
    setLoading(true);
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
  }, [fromList, pandalId, sponsorId]);

  return { sponsor: fromList ?? sponsor, loading: fromList ? false : loading };
}

export function usePandalSponsorAudits(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error } = useSharedOrLocalCollection<PandalSponsorAudit>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("sponsorAudits"),
    shared: data.sponsorAudits,
    path: pandalId ? pandalSponsorAuditsCol(pandalId) : null,
    mapDoc: (id, docData) => ({
      id,
      ...(docData as Omit<PandalSponsorAudit, "id">),
    }),
    query: { orderByField: "at", orderDirection: "desc", limitTo: 80 },
  });
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
    void loadSponsorHistory(db, pandalId, sponsorId, festivalIds)
      .then((next) => {
        if (!cancelled) setRows(next);
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
