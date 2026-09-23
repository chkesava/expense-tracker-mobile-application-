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
 *
 * SPENDLY-110: `docId` scopes the listener to one transaction's history, for
 * the detail sheet. It filters client-side rather than adding a `where` clause
 * because that would need a composite index with the existing `createdAt`
 * ordering, and a single row's history is a handful of documents out of a
 * collection the Audit tab already streams in full.
 */
export function useLedgerEvents(options?: {
  enabled?: boolean;
  docId?: string;
}) {
  const enabled = options?.enabled !== false;
  const docId = options?.docId;
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
        const rows = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as Omit<LedgerEvent, "id">),
          id: docSnap.id,
        }));
        setEvents(docId ? rows.filter((row) => row.docId === docId) : rows);
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
  }, [uid, enabled, docId, attempt, setError]);

  return { events, loading, error, retry };
}
