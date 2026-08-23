import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";

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

    const pandalUnsubs = new Map<string, () => void>();
    const membershipsUnsub = onSnapshot(
      collection(db, "users", uid, "pandalMemberships"),
      (snapshot) => {
        const activeIds = new Set(
          snapshot.docs
            .filter((docSnap) => {
              const status = docSnap.data().status;
              return status == null || status === "active";
            })
            .map((docSnap) => docSnap.id)
        );
        for (const [pandalId, unsub] of pandalUnsubs) {
          if (activeIds.has(pandalId)) continue;
          unsub();
          pandalUnsubs.delete(pandalId);
          setPandals((prev) => prev.filter((item) => item.id !== pandalId));
        }
        if (activeIds.size === 0) {
          setPandals([]);
          setError(null);
          setLoading(false);
          return;
        }
        for (const pandalId of activeIds) {
          if (pandalUnsubs.has(pandalId)) continue;
          const unsub = onSnapshot(
            doc(db, "pandals", pandalId),
            (pandalSnap) => {
              if (!pandalSnap.exists()) {
                setPandals((prev) => prev.filter((item) => item.id !== pandalId));
                setLoading(false);
                return;
              }
              const next: Pandal = {
                id: pandalSnap.id,
                ...(pandalSnap.data() as Omit<Pandal, "id">),
              };
              setPandals((prev) => {
                const others = prev.filter((item) => item.id !== next.id);
                return [...others, next];
              });
              setError(null);
              setLoading(false);
            },
            snapshotErrorHandler(
              "snapshot.ganesh.pandal",
              (failure) => {
                setError(failure);
                setLoading(false);
              },
              "Couldn't load this Pandal."
            )
          );
          pandalUnsubs.set(pandalId, unsub);
        }
      },
      snapshotErrorHandler(
        "snapshot.ganesh.memberships",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your Pandals."
      )
    );

    return () => {
      membershipsUnsub();
      for (const unsub of pandalUnsubs.values()) unsub();
    };
  }, [uid]);

  return { pandals, loading, error };
}
