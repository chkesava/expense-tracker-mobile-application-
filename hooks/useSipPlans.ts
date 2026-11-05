import { useEffect, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
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
  // SPENDLY-600: the calendar's plans follow readModel.sipPlans like useSips (598).
  const plansSource = useReadModelSource("sipPlans");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/sipPlans`;
    const applyPlans = (docs: SourceDoc[]) => {
      setPlans(docs.map((d) => ({ id: d.id, ...d.data }) as SipPlan));
      setError(null);
      setLoading(false);
    };
    if (plansSource.mode === "supabase") return plansSource.subscribe(applyPlans);
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "sipPlans"),
      (snap) => {
        const docs = toSourceDocs(snap);
        applyPlans(docs);
        if (plansSource.mode === "shadow") void plansSource.shadow(docs);
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
  }, [uid, enabled, attempt, plansSource.mode]);

  return { plans, loading, error, retry };
}
