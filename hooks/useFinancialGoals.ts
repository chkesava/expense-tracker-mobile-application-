import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";

export const useFinancialGoals = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const {
    goals: sharedGoals,
    goalsLoading,
    goalsError,
    retryGoals,
  } = useExpenseReferenceData();
  const goals = enabled ? sharedGoals : [];
  const loading = enabled ? goalsLoading : false;
  const error = enabled ? goalsError : null;
  const retry = retryGoals;

  const addGoal = async (
    name: string,
    targetAmount: number,
    currentAmount: number,
    deadline?: string
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !name.trim() || targetAmount <= 0) return;

    try {
      const outcome = await commitWrite(
        () =>
          addDoc(collection(db, "users", uid, "financialGoals"), {
            name: name.trim(),
            targetAmount: Number(targetAmount),
            currentAmount: Number(currentAmount) || 0,
            deadline: deadline || "",
            createdAt: serverTimestamp(),
          }),
        { label: "goal" }
      );
      toast.success(writeSavedMessage(outcome, "Goal added"));
    } catch (err) {
      logError("financialGoals.addGoal", err);
      toast.error("Failed to add goal");
    }
  };

  const updateGoalProgress = async (id: string, currentAmount: number) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      const outcome = await commitWrite(
        () =>
          updateDoc(doc(db, "users", uid, "financialGoals", id), {
            currentAmount: Number(currentAmount) || 0,
          }),
        { label: "goal" }
      );
      toast.success(writeSavedMessage(outcome, "Goal progress updated"));
    } catch (err) {
      logError("financialGoals.updateGoal", err);
      toast.error("Failed to update goal");
    }
  };

  const deleteGoal = async (id: string) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "users", uid, "financialGoals", id)),
        { label: "goal deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Goal deleted"));
    } catch (err) {
      logError("financialGoals.deleteGoal", err);
      toast.error("Failed to delete goal");
    }
  };

  return { goals, loading, addGoal, updateGoalProgress, deleteGoal, error, retry };
};
