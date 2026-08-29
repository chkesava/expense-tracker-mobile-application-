import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";

export const useCategorizationRules = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const {
    rules: sharedRules,
    rulesLoading,
    rulesError,
    retryRules,
  } = useExpenseReferenceData();
  const rules = enabled ? sharedRules : [];
  const loading = enabled ? rulesLoading : false;
  const error = enabled ? rulesError : null;
  const retry = retryRules;

  const addRule = async (
    keyword: string,
    category: string,
    subcategory?: string
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !keyword.trim() || !category.trim()) return;

    try {
      await addDoc(
        collection(db, "users", uid, "categorizationRules"),
        {
          keyword: keyword.trim().toLowerCase(),
          category: category.trim(),
          ...(subcategory?.trim() ? { subcategory: subcategory.trim() } : {}),
          createdAt: serverTimestamp(),
        }
      );
      toast.success("Auto-category rule added");
    } catch (err) {
      logError("categorizationRules.addRule", err);
      toast.error("Failed to add rule");
    }
  };

  const deleteRule = async (id: string) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      await deleteDoc(
        doc(db, "users", uid, "categorizationRules", id)
      );
      toast.success("Rule deleted");
    } catch (err) {
      logError("categorizationRules.deleteRule", err);
      toast.error("Failed to delete rule");
    }
  };

  return { rules, loading, addRule, deleteRule, error, retry };
};
