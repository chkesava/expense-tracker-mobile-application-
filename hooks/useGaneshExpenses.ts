import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshExpense } from "@/shared/types/ganesh";

export function useGaneshExpenses(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshExpense>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "expenses") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshExpense, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { expenses: items, loading, error, pendingCount };
}

export function useGaneshExpense(
  pandalId: string | null,
  festivalId: string | null,
  expenseId: string | null
) {
  const [expense, setExpense] = useState<GaneshExpense | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !expenseId) {
      setExpense(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "expenses"), expenseId];
    const unsubscribe = onSnapshot(
      doc(db, root, ...rest),
      (snap) => {
        setExpense(
          snap.exists()
            ? {
                id: snap.id,
                ...(snap.data() as Omit<GaneshExpense, "id">),
                pendingWrite: snap.metadata.hasPendingWrites,
              }
            : null
        );
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.ganesh.expense", () => setLoading(false), "Couldn't load expense.")
    );
    return unsubscribe;
  }, [pandalId, festivalId, expenseId]);

  return { expense, loading };
}
