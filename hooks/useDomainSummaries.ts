import { useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { EpfSummary } from "@/shared/types/financialSummary";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";

export function useEpfSummary() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summary, setSummary] = useState<EpfSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    const path = `users/${uid}/financialSummaries/epf`;
    setLoading(true);
    
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "financialSummaries", "epf"),
      (snap) => {
        if (snap.exists()) {
          setSummary(snap.data() as EpfSummary);
        } else {
          setSummary(null);
        }
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.epfSummary", (err) => {
        setError(err as unknown as Error);
        setLoading(false);
      })
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid]);

  return { summary, loading, error };
}
