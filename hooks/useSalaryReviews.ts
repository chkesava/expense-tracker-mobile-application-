import { useEffect, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import type { SalaryReview } from "@/shared/features/salary/types";

/**
 * Loads user salary reviews / decisions (SPENDLY-327, SPENDLY-334).
 * Dual-store aware: reads from Firestore by default, or Supabase via read-model local copy.
 */
export function useSalaryReviews(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [reviews, setReviews] = useState<SalaryReview[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const reviewsSource = useReadModelSource("salaryReviews");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/salaryReviews`;

    const applyReviews = (docs: SourceDoc[]) => {
      const list: SalaryReview[] = [];
      for (const d of docs) {
        const data = d.data as Omit<SalaryReview, "id">;
        if (!data) continue;
        list.push({ ...data, id: d.id });
      }
      setReviews(list);
      setError(null);
      setLoading(false);
    };

    if (reviewsSource.mode === "supabase") return reviewsSource.subscribe(applyReviews);

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "salaryReviews"),
      (snap) => {
        const docs = toSourceDocs(snap);
        applyReviews(docs);
        if (reviewsSource.mode === "shadow") void reviewsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.salaryReviews",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your salary reviews."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, reviewsSource.mode]);

  return { reviews, loading, error, retry };
}
