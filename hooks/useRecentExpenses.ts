import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { Expense } from "@/shared/types/expense";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";

export function useRecentExpenses(maxCount: number = 5) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const path = `users/${uid}/expenses?limit=${maxCount}`;
    const ref = collection(db, "users", uid, "expenses");
    const q = query(ref, orderBy("date", "desc"), orderBy("createdAt", "desc"), limit(maxCount));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense);
        setExpenses(rows);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.recentExpenses",
        () => setLoading(false),
        "Couldn't load recent expenses."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, maxCount]);

  return { expenses, loading };
}
