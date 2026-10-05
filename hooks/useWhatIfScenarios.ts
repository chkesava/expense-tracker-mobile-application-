import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { WHAT_IF_SCENARIOS_COLLECTION } from "@/services/whatIf/whatIfScenarioStore";
import { sortWhatIfScenarios, whatIfScenarioFromSnapshot, type WhatIfScenario } from "@/shared/utils/whatIfScenarios";

/**
 * Saved What-If scenarios (SPENDLY-202), live. Duress-aware uid. The listener
 * serves cached documents offline; a load failure surfaces as `error` with
 * `retry`, and pending outbox writes appear as soon as they are applied.
 */
export function useWhatIfScenarios() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setScenarios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${WHAT_IF_SCENARIOS_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, WHAT_IF_SCENARIOS_COLLECTION),
      (snap) => {
        setScenarios(sortWhatIfScenarios(snap.docs.map((d) => whatIfScenarioFromSnapshot(d.id, d.data()))));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.whatIfScenarios",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your saved scenarios."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, attempt]);

  return { uid, scenarios, loading, error, retry };
}
