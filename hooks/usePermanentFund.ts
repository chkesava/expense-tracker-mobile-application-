import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { EMPTY_PERMANENT_FUND, type PermanentFundSummary } from "@/shared/types/ganesh";
import { parsePermanentFund } from "@/shared/utils/ganeshMath";
import { permanentFundDoc } from "@/shared/utils/ganeshPaths";

export function usePermanentFund(pandalId: string | null) {
  const [fund, setFund] = useState<PermanentFundSummary>(EMPTY_PERMANENT_FUND);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId) {
      setFund(EMPTY_PERMANENT_FUND);
      setLoading(false);
      return;
    }
    const [root, ...rest] = permanentFundDoc(pandalId);
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
  }, [pandalId]);

  return { fund, loading };
}
