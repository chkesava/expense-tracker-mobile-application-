import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useAuth } from "@/providers/AuthProvider";
import type { MoneyDecision } from "@/shared/types/decision";

/**
 * Listener for `users/{uid}/decisions` (SPENDLY-363). Mounted only by the
 * decision screens, never from the app shell. No `orderBy`, so no index:
 * ordering is done on the client (`sortDecisionsForList`).
 */
export function useDecisions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [decisions, setDecisions] = useState<MoneyDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setDecisions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      collection(db, "users", uid, "decisions"),
      (snap) => {
        setDecisions(snap.docs.map((d) => ({ ...(d.data() as Omit<MoneyDecision, "id">), id: d.id })));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.decisions",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your decisions."
      )
    );
  }, [uid, enabled, attempt, setError]);

  const byId = useMemo(() => new Map(decisions.map((d) => [d.id, d] as const)), [decisions]);
  return { decisions, byId, loading, error, retry };
}
