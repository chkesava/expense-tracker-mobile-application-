import { useEffect, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { useAuth } from "@/providers/AuthProvider";
import type { GroupFund } from "@/shared/types/groupFund";
import { groupFundFromDoc, sortGroupFunds } from "@/shared/utils/groupFundDocs";

/**
 * The user's Group Funds (SPENDLY-685, epic SPENDLY-678), for display. Mount
 * it only where funds are on screen (`enabled`, SPENDLY-406): one listener on
 * `groupFunds`, whose docs are small (members and purposes are embedded), so
 * the list never reads any event.
 *
 * Reads through the per-collection switch: `firestore` (default) keeps the
 * listener, `shadow` compares, `supabase` reads the on-device copy with no
 * Firestore listener mounted.
 *
 * R4.3a: these funds may come from the copy, so writers never build from
 * them. A write loads its fund from Firestore first
 * (`services/groupFunds/groupFundStore.loadGroupFund`).
 */
export function useGroupFunds(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  // firestore (default) | shadow | supabase, per readModel.groupFunds.
  const fundsSource = useReadModelSource("groupFunds");
  const [funds, setFunds] = useState<GroupFund[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setFunds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/groupFunds`;
    const apply = (docs: SourceDoc[]) => {
      setFunds(sortGroupFunds(docs.map((d) => groupFundFromDoc(d.id, d.data)).filter((f): f is GroupFund => !!f)));
      setError(null);
      setLoading(false);
    };
    if (fundsSource.mode === "supabase") return fundsSource.subscribe(apply);
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "groupFunds"),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (fundsSource.mode === "shadow") void fundsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.groupFunds",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your group funds."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, setError, fundsSource.mode]);

  return { funds, loading, error, retry };
}
