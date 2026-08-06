import { useCallback, useEffect, useState } from "react";
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
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { VaultExpense } from "@/shared/types/vaultExpense";

export function useVaultExpenses(vaultId?: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const userName = user?.displayName || user?.email?.split("@")[0] || "User";

  const [expenses, setExpenses] = useState<VaultExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!vaultId || !db) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "vaults", vaultId, "expenses"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: VaultExpense[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<VaultExpense, "id">),
        }));
        setExpenses(list);
        setLoading(false);
      },
      (err) => {
        console.warn("Error fetching vault expenses:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [vaultId]);

  const addVaultExpense = useCallback(
    async (params: {
      amount: number;
      type: "deposit" | "withdrawal";
      category?: string;
      note?: string;
      date?: string;
    }) => {
      const db = getFirestoreDb();
      if (!vaultId || !uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const payload: Omit<VaultExpense, "id"> = {
          vaultId,
          amount: params.amount,
          type: params.type,
          category: params.category || (params.type === "deposit" ? "Funding" : "General"),
          note: params.note?.trim() || "",
          date: params.date || new Date().toISOString().slice(0, 10),
          createdBy: uid,
          createdByName: userName,
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(
          collection(db, "vaults", vaultId, "expenses"),
          payload
        );
        toast.success(params.type === "deposit" ? "Deposit recorded" : "Withdrawal recorded");
        return docRef.id;
      } catch (err: any) {
        console.error("Failed adding vault transaction:", err);
        toast.error("Failed to record transaction");
        return null;
      }
    },
    [vaultId, uid, userName]
  );

  const deleteVaultExpense = useCallback(
    async (expenseId: string) => {
      const db = getFirestoreDb();
      if (!vaultId || !db) return false;

      try {
        await deleteDoc(doc(db, "vaults", vaultId, "expenses", expenseId));
        toast.success("Transaction removed");
        return true;
      } catch (err: any) {
        console.error("Failed deleting vault transaction:", err);
        toast.error("Failed to delete transaction");
        return false;
      }
    },
    [vaultId]
  );

  return {
    expenses,
    loading,
    addVaultExpense,
    deleteVaultExpense,
  };
}
