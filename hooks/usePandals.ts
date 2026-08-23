import { useEffect, useState } from "react";
import { collection, onSnapshot, or, query, where } from "firebase/firestore";

import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { Pandal } from "@/shared/types/ganesh";

export function usePandals() {
  const { realUser } = useAuth();
  const uid = realUser?.uid;
  const [pandals, setPandals] = useState<Pandal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setPandals([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "pandals"),
      or(where("ownerId", "==", uid), where("memberIds", "array-contains", uid))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPandals(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Pandal, "id">),
          }))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.ganesh.pandals", (failure) => {
        setError(failure);
        setLoading(false);
      }, "Couldn't load your Pandals.")
    );
    return unsubscribe;
  }, [uid]);

  return { pandals, loading, error };
}
