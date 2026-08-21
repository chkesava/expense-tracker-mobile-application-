import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { logError } from "@/lib/errors";
import type { SplitPublicShare } from "@/shared/types/splitPublicShare";

export function usePublicSplitShare(slug: string | undefined) {
  const [share, setShare] = useState<SplitPublicShare | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setShare(null);
      setLoading(false);
      setError("Missing split link.");
      return;
    }

    let cancelled = false;
    const db = getFirestoreDb();
    if (!db) {
      setShare(null);
      setLoading(false);
      setError("Splits aren't configured on this device.");
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "splitPublicShares"),
      where("slug", "==", slug),
      limit(1)
    );

    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        if (snap.empty) {
          setShare(null);
          setError("This split link is invalid or has expired.");
          return;
        }
        const docSnap = snap.docs[0];
        setShare({
          id: docSnap.id,
          ...(docSnap.data() as Omit<SplitPublicShare, "id">),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        logError("publicSplitShare.load", err);
        setShare(null);
        setError("Couldn't load this split.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { share, loading, error };
}
