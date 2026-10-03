import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type { SipPlan } from "@/shared/features/sip/types";

/**
 * Read-only SIP plans (SPENDLY-178). The calendar only needs the plans, so it
 * doesn't mount `useSips`, which also listens to transactions, positions and
 * notifications. Same collection and shape as `useSips().plans`.
 */
export function useSipPlans(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/sipPlans`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "sipPlans"),
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SipPlan));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.sipPlans",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your SIP plans."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  return { plans, loading, error, retry };
}
