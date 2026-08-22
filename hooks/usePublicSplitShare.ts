/**
 * Reads the world-readable `splitPublicShares` snapshot behind `/split/:slug`.
 *
 * Live rather than one-shot: friends keep the link open while other people pay,
 * and a stale page showing someone as unpaid after they have settled is worse
 * than no page. `attempt` from `useLoadFailure` is in the effect deps because
 * bumping it is what re-establishes a listener that failed to attach.
 */

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, toLoadFailure, type LoadFailure } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import type { SplitPublicShare } from "@/shared/types/splitPublicShare";

export type UsePublicSplitShare = {
  share: SplitPublicShare | null;
  loading: boolean;
  error: LoadFailure | null;
  retry: () => void;
};

export function usePublicSplitShare(slug: string | undefined): UsePublicSplitShare {
  const [share, setShare] = useState<SplitPublicShare | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    if (!slug) {
      setShare(null);
      setLoading(false);
      setError(toLoadFailure(new Error("missing-slug"), "Missing split link."));
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      setShare(null);
      setLoading(false);
      setError(
        toLoadFailure(
          new Error("firestore-unavailable"),
          "Splits aren't configured on this device."
        )
      );
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "splitPublicShares"),
      where("slug", "==", slug),
      limit(1)
    );

    return onSnapshot(
      q,
      (snap) => {
        setLoading(false);
        if (snap.empty) {
          setShare(null);
          // Not retryable: a bad slug fails the same way every time.
          setError({
            message: "This split link is invalid or has expired.",
            kind: "notFound",
            retryable: false,
          });
          return;
        }
        const docSnap = snap.docs[0];
        setError(null);
        setShare({
          id: docSnap.id,
          ...(docSnap.data() as Omit<SplitPublicShare, "id">),
        });
      },
      snapshotErrorHandler(
        "snapshot.publicSplitShare",
        (failure) => {
          setShare(null);
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this split."
      )
    );
  }, [slug, attempt, setError]);

  return { share, loading, error, retry };
}
