/**
 * Watches the self-service claims for one split.
 *
 * One listener per document id rather than a collection query, because
 * `splitShareClaims` deliberately denies `list` — both readers already know
 * every id (the public page from `share.claimKeys`, the organizer from the
 * split's participants), so closing `list` costs nothing and stops the
 * collection being enumerable. Participant counts are single-digit, so a
 * handful of doc listeners is cheaper than it looks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
import { splitClaimDocIds } from "@/shared/utils/splitClaims";

export type UseSplitShareClaims = {
  claims: SplitShareClaim[];
  loading: boolean;
  error: LoadFailure | null;
  retry: () => void;
};

export function useSplitShareClaims(
  shareId: string | undefined,
  participantKeys: Array<string | undefined>,
  options?: { enabled?: boolean }
): UseSplitShareClaims {
  const enabled = options?.enabled !== false;
  const [claims, setClaims] = useState<SplitShareClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();
  const byId = useRef(new Map<string, SplitShareClaim>());

  // Join into a primitive so a fresh array identity on every render does not
  // tear down and re-establish every listener.
  const idKey = useMemo(
    () => splitClaimDocIds(shareId, participantKeys).join("|"),
    [shareId, participantKeys]
  );

  useEffect(() => {
    const ids = idKey ? idKey.split("|") : [];
    const db = getFirestoreDb();

    byId.current = new Map();
    setClaims([]);

    if (!enabled || !db || ids.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const flush = () => setClaims([...byId.current.values()]);

    // One listener per participant, but a failure is almost always one cause
    // for all of them (rules, offline, revoked access). Report it once instead
    // of N times, or a 15-person split logs 15 identical warnings.
    let reported = false;
    const report = snapshotErrorHandler(
      "snapshot.splitShareClaims",
      (failure) => {
        setError(failure);
        setLoading(false);
      },
      "Couldn't load updates from the share link."
    );
    const onFail = (error: unknown) => {
      if (reported) return;
      reported = true;
      report(error);
    };

    const unsubscribes = ids.map((id) =>
      onSnapshot(
        doc(db, "splitShareClaims", id),
        (snap) => {
          setLoading(false);
          if (snap.exists()) {
            byId.current.set(id, {
              id: snap.id,
              ...(snap.data() as Omit<SplitShareClaim, "id">),
            });
          } else {
            byId.current.delete(id);
          }
          flush();
        },
        onFail
      )
    );

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [idKey, enabled, attempt, setError]);

  return { claims, loading, error, retry };
}
