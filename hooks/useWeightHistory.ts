import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { WeightEntry } from "@/shared/types/nutrition";

export function useWeightHistory() {
  const { user } = useAuth();
  const db = getFirestoreDb();
  const [history, setHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const historyQuery = query(
      collection(db, `users/${user.uid}/weight_history`),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      historyQuery,
      (snap) => {
        setHistory(
          snap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<WeightEntry, "id">),
          }))
        );
        setLoading(false);
      },
      (error) => {
        logError("nutrition.weight.listen", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user, db]);

  const addWeightRecord = useCallback(
    async (date: string, weightKg: number, notes?: string) => {
      if (!user || !db) return;
      await setDoc(doc(db, `users/${user.uid}/weight_history`, date), {
        date,
        weightKg,
        notes: notes || "",
        timestamp: Date.now(),
      });
    },
    [user, db]
  );

  const deleteWeightRecord = useCallback(
    async (date: string) => {
      if (!user || !db) return;
      await deleteDoc(doc(db, `users/${user.uid}/weight_history`, date));
    },
    [user, db]
  );

  return { history, loading, addWeightRecord, deleteWeightRecord };
}
