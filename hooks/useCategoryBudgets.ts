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

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { CategoryBudget } from "@/shared/types/expense";

export const useCategoryBudgets = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      },
      (err) => {
        console.error("useCategoryBudgets snapshot error:", err);
        setLoading(false);
      }
    );
  }, [uid, enabled]);

  const addBudget = async (
    category: string,
    amount: number,
    month: string,
    subcategory?: string
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !category.trim() || !month || amount <= 0) return;

    try {
      const outcome = await commitWrite(
        () =>
          addDoc(collection(db, "users", uid, "categoryBudgets"), {
            category: category.trim(),
            ...(subcategory?.trim() ? { subcategory: subcategory.trim() } : {}),
            amount: Number(amount),
            month,
            createdAt: serverTimestamp(),
          }),
        { label: "budget" }
      );
      toast.success(
        writeSavedMessage(
          outcome,
          subcategory?.trim()
            ? "Subcategory budget added"
            : "Category budget added"
        )
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to add category budget");
    }
  };

  const deleteBudget = async (id: string) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "users", uid, "categoryBudgets", id)),
        { label: "budget deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Category budget deleted"));
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete category budget");
    }
  };

  return { budgets, loading, addBudget, deleteBudget };
};
