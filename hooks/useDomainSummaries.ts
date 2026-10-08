import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { InvestmentsSummary, EpfSummary } from "@/shared/types/financialSummary";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import type { LoadFailure } from "@/hooks/useLoadFailure";

export function useInvestmentsSummary() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    const path = `users/${uid}/financialSummaries/investments`;
    setLoading(true);
    
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "financialSummaries", "investments"),
      (snap) => {
        if (snap.exists()) {
          setSummary(snap.data() as InvestmentsSummary);
        } else {
          setSummary(null);
        }
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.investmentsSummary", (err) => {
        setError(err);
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

export function useEpfSummary() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [summary, setSummary] = useState<EpfSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);

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
        setError(err);
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
