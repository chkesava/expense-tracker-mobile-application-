import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useAuth } from "@/providers/AuthProvider";
import type { FeeReview } from "@/shared/types/fee";

/**
 * Listener for `users/{uid}/feeReviews` (SPENDLY-315).
 *
 * Mounted only by fee surfaces, never from the shell — like `useLedgerEvents`,
 * a session-long subscription would charge every user for a feature most
 * never open. No `orderBy`, so no index: reviews are keyed by transaction and
 * looked up by key, never listed in order.
 */
export function useFeeReviews(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [reviews, setReviews] = useState<FeeReview[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setReviews([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "feeReviews"),
      (snapshot) => {
        setReviews(
          snapshot.docs.map((docSnap) => ({
            ...(docSnap.data() as Omit<FeeReview, "id">),
            id: docSnap.id,
          }))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.feeReviews",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your fee reviews."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt, setError]);

  return { reviews, loading, error, retry };
}
