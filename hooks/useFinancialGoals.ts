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
  updateDoc,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { FinancialGoal } from "@/shared/types/expense";

export const useFinancialGoals = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setGoals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "financialGoals"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(
      q,
      (snap) => {
        setGoals(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinancialGoal))
        );
        setLoading(false);
      },
      (err) => {
        console.error("useFinancialGoals snapshot error:", err);
        setLoading(false);
      }
    );
  }, [uid, enabled]);

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
      console.error(err);
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
      console.error(err);
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
      console.error(err);
      toast.error("Failed to delete goal");
    }
  };

  return { goals, loading, addGoal, updateGoalProgress, deleteGoal };
};
