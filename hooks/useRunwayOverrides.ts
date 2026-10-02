import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { RUNWAY_OVERRIDES_COLLECTION } from "@/services/runway/runwayOverrideStore";
import type { RunwayOverride } from "@/shared/types/runway";

/**
 * The user's runway overrides (SPENDLY-207). Mounted only on runway screens
 * and the account detail row — never in a shell provider. Duress-aware uid.
 */
export function useRunwayOverrides(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [overrides, setOverrides] = useState<RunwayOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setOverrides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${RUNWAY_OVERRIDES_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, RUNWAY_OVERRIDES_COLLECTION),
      (snapshot) => {
        setOverrides(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RunwayOverride, "id">) })));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.runwayOverrides",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your runway choices."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  return { uid, overrides, loading, error, retry };
}
