import { useEffect, useLayoutEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import { EMPTY_PERMANENT_FUND, type PermanentFundSummary } from "@/shared/types/ganesh";
import { parsePermanentFund } from "@/shared/utils/ganeshMath";
import { permanentFundDoc } from "@/shared/utils/ganeshPaths";

export function usePermanentFund(pandalId: string | null) {
  const data = useGaneshData();
  const useShared = Boolean(pandalId) && pandalId === data.sessionPandalId;

  useLayoutEffect(() => {
    if (useShared) data.request("permanentFund");
  }, [useShared, data.request]);

  const [fund, setFund] = useState<PermanentFundSummary>(EMPTY_PERMANENT_FUND);
  const [loading, setLoading] = useState(!useShared);

  useEffect(() => {
    if (useShared) return;
    const db = getFirestoreDb();
    if (!db || !pandalId) {
      setFund(EMPTY_PERMANENT_FUND);
      setLoading(false);
      return;
    }
    const [root, ...rest] = permanentFundDoc(pandalId);
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setFund(snap.exists() ? parsePermanentFund(snap.data()) : EMPTY_PERMANENT_FUND);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.permanentFund",
        () => setLoading(false),
        "Couldn't load Permanent Fund."
      )
    );
    return unsubscribe;
  }, [useShared, pandalId]);

  if (useShared) {
    return { fund: data.fund, loading: data.fundLoading };
  }
  return { fund, loading };
}
