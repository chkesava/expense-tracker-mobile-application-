import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { NetWorthSummary } from "@/shared/types/financialSummary";

export function useNetWorthSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setSummary(null);
      setLoading(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) return;

    const ref = doc(db, "users", user.uid, "financialSummaries", "netWorth");
    const unsubscribe = onSnapshot(
      ref,
      (docSnap) => {
        if (docSnap.exists()) {
          setSummary(docSnap.data() as NetWorthSummary);
        } else {
          setSummary(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Failed to subscribe to netWorth summary:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  return { summary, loading };
}
