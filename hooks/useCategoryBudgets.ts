import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
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
  } = useExpenseReferenceData();
  const budgets = enabled ? sharedBudgets : [];
  const loading = enabled ? budgetsLoading : false;
  const error = enabled ? budgetsError : null;
  const retry = retryBudgets;

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
      toast.success(writeSavedMessage(outcome, "Category budget deleted"));
    } catch (err) {
      logError("categoryBudgets.deleteCategoryBudget", err);
      toast.error("Failed to delete category budget");
    }
  };

  return { budgets, loading, addBudget, deleteBudget, error, retry };
};
