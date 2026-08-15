import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { CategoryBudget } from "@/shared/types/expense";

export const useCategoryBudgets = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "categoryBudgets"),
      orderBy("month", "desc")
    );

    return onSnapshot(
      q,
      (snap) => {
        setBudgets(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategoryBudget))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.categoryBudgets",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your budgets."
      )
    );
  }, [uid, enabled, attempt]);

  const addBudget = async (
    category: string,
    amount: number,
    month: string,
    subcategory?: string
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !category.trim() || !month || amount <= 0) return;

    try {
      await addDoc(collection(db, "users", uid, "categoryBudgets"), {
        category: category.trim(),
        ...(subcategory?.trim() ? { subcategory: subcategory.trim() } : {}),
        amount: Number(amount),
        month,
        createdAt: serverTimestamp(),
      });
      toast.success(
        subcategory?.trim()
          ? "Subcategory budget added"
          : "Category budget added"
      );
    } catch (err) {
      logError("categoryBudgets.addCategoryBudget", err);
      toast.error("Failed to add category budget");
    }
  };

  const deleteBudget = async (id: string) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      await deleteDoc(doc(db, "users", uid, "categoryBudgets", id));
      toast.success("Category budget deleted");
    } catch (err) {
      logError("categoryBudgets.deleteCategoryBudget", err);
      toast.error("Failed to delete category budget");
    }
  };

  return { budgets, loading, addBudget, deleteBudget, error, retry };
};
