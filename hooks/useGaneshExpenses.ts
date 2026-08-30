import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { getFirestoreDb } from "@/lib/firebase";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshExpense } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useGaneshExpenses(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount } = useSharedOrLocalCollection<GaneshExpense>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.expenses,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "expenses") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<GaneshExpense, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 },
  });
  return { expenses: items, loading, error, pendingCount };
}

export function useGaneshExpense(
  pandalId: string | null,
  festivalId: string | null,
  expenseId: string | null
) {
  const { expenses } = useGaneshExpenses(pandalId, festivalId);
  const fromList = expenses.find((item) => item.id === expenseId) ?? null;
  const [expense, setExpense] = useState<GaneshExpense | null>(fromList);
  const [loading, setLoading] = useState(!fromList);

  useEffect(() => {
    if (fromList) {
      setExpense(fromList);
      setLoading(false);
      return;
    }
    const db = getFirestoreDb();
    if (!db || !pandalId || !festivalId || !expenseId) {
      setExpense(null);
      setLoading(false);
      return;
    }
    const [root, ...rest] = [...festivalCol(pandalId, festivalId, "expenses"), expenseId];
    setLoading(true);
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
  }, [fromList, pandalId, festivalId, expenseId]);

  return { expense: fromList ?? expense, loading: fromList ? false : loading };
}
