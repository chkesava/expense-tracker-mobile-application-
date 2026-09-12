/**
 * Every EPF contribution across all establishments — KAN-71.
 *
 * `useEpfContributions(establishmentId)` filters to one employer and owns the
 * writes. React forbids looping hooks, so nothing could sum across employers
 * until this existed.
 *
 * Read-only and unfiltered: a working lifetime produces a few hundred rows
 * (20 years ≈ 240), so no filter means no index and no deploy dependency.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type { EpfContribution } from "@/shared/features/epf/types";
import { EPF_CONTRIBUTIONS_COLLECTION } from "@/shared/features/epf/types";
import {
  normalizeEpfContribution,
  sortContributionsByMonth,
} from "@/shared/features/epf/utils/contributions";

export function useEpfAllContributions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  // Duress-aware uid, matching every other EPF hook.
  const { user } = useAuth();
  const uid = user?.uid;

  const [contributions, setContributions] = useState<EpfContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setContributions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const path = `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}`;

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, EPF_CONTRIBUTIONS_COLLECTION),
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        setContributions(
          sortContributionsByMonth(
            snapshot.docs.map((docSnap) =>
              normalizeEpfContribution(docSnap.id, docSnap.data() as Record<string, unknown>)
            )
          )
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfAllContributions",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your EPF contributions."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  return { contributions, loading, error, retry };
}
