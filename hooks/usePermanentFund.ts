import { useEffect, useLayoutEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
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
  // GS-032: this hook returned only `fund` and `loading`, so a failed load was
  // indistinguishable from a fund holding nothing — and `fund.total === 0`
  // drives the "add initial balance" call to action, which was therefore
  // offered on funds that might already hold money.
  const [error, setError] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

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
        setError(null);
      },
      snapshotErrorHandler(
        "snapshot.ganesh.permanentFund",
        (failure) => {
          setLoading(false);
          setError(failure);
        },
        "Couldn't load Permanent Fund."
      )
    );
    return unsubscribe;
  }, [useShared, pandalId, attempt]);

  if (useShared) {
    return {
      fund: data.fund,
      loading: data.fundLoading,
      error: data.fundError,
      retry: data.retryFund,
    };
  }
  return {
    fund,
    loading,
    error,
    retry: () => {
      setError(null);
      setAttempt((n) => n + 1);
    },
  };
}
