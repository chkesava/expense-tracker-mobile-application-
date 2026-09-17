import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useAuth } from "@/providers/AuthProvider";
import type { LedgerEvent } from "@/shared/types/ledgerEvent";

/**
 * Audit-tab listener for journal edits/deletes (SPENDLY-38).
 * Mount only while the Audit tab is visible — do not leave this on from the shell.
 */
export function useLedgerEvents(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, "users", uid, "ledgerEvents"),
        orderBy("createdAt", "desc")
      ),
      (snapshot) => {
        setEvents(
          snapshot.docs.map((docSnap) => ({
            ...(docSnap.data() as Omit<LedgerEvent, "id">),
            id: docSnap.id,
          }))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ledgerEvents",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load the audit trail."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt, setError]);

  return { events, loading, error, retry };
}
