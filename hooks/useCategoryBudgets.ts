import { useEffect } from "react";
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "@/lib/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { noteDirectWrites } from "@/lib/readModelWriteHooks";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";

export const useCategoryBudgets = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const {
    budgets: sharedBudgets,
    budgetsLoading,
    budgetsError,
    retryBudgets,
    registerBudgetsSubscriber,
  } = useExpenseReferenceData();
  const budgets = enabled ? sharedBudgets : [];
  const loading = enabled ? budgetsLoading : false;
  const error = enabled ? budgetsError : null;
  const retry = retryBudgets;

  useEffect(() => {
    if (!enabled) return;
    return registerBudgetsSubscriber?.();
  }, [enabled, registerBudgetsSubscriber]);

  const addBudget = async (
    category: string,
    amount: number,
    month: string,
    subcategory?: string
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !category.trim() || !month || amount <= 0) return;

    try {
      // A pre-made id (same as addDoc) so the read model can be told the path.
      const ref = doc(collection(db, "users", uid, "categoryBudgets"));
      const outcome = await commitWrite(
        () =>
          setDoc(ref, {
            category: category.trim(),
            ...(subcategory?.trim() ? { subcategory: subcategory.trim() } : {}),
            amount: Number(amount),
            month,
            createdAt: serverTimestamp(),
          }),
        { label: "budget" }
      );
      noteDirectWrites(uid, [ref.path]);
      toast.success(
        writeSavedMessage(
          outcome,
          subcategory?.trim()
            ? "Subcategory budget added"
            : "Category budget added"
        )
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
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "users", uid, "categoryBudgets", id)),
        { label: "budget deletion" }
      );
      noteDirectWrites(uid, [`users/${uid}/categoryBudgets/${id}`]);
      toast.success(writeSavedMessage(outcome, "Category budget deleted"));
    } catch (err) {
      logError("categoryBudgets.deleteCategoryBudget", err);
      toast.error("Failed to delete category budget");
    }
  };

  return { budgets, loading, addBudget, deleteBudget, error, retry };
};
