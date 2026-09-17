/**
 * Reads the world-readable `splitPublicShares` snapshot behind `/split/:slug`.
 *
 * Live rather than one-shot: friends keep the link open while other people pay,
 * and a stale page showing someone as unpaid after they have settled is worse
 * than no page. `attempt` from `useLoadFailure` is in the effect deps because
 * bumping it is what re-establishes a listener that failed to attach.
 *
 * Prefers get-by-slug (document id). Falls back to a slug query for auto-id
 * docs minted before SPENDLY-36, until those are backfilled.
 */

import { useEffect, useState } from "react";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, toLoadFailure, type LoadFailure } from "@/lib/firestoreErrors";
import { listenBySlugWithQueryFallback } from "@/lib/listenBySlug";
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

    return listenBySlugWithQueryFallback(db, "splitPublicShares", slug, {
      onDoc: (id, data) => {
        setLoading(false);
        setError(null);
        setShare({
          id,
          ...(data as Omit<SplitPublicShare, "id">),
        });
      },
      onMissing: () => {
        setLoading(false);
        setShare(null);
        setError({
          message: "This split link is invalid or has expired.",
          kind: "notFound",
          retryable: false,
        });
      },
      onError: snapshotErrorHandler(
        "snapshot.publicSplitShare",
        (failure) => {
          setShare(null);
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this split."
      ),
    });
  }, [slug, attempt, setError]);

  return { share, loading, error, retry };
}
