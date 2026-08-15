import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { VaultExpense } from "@/shared/types/vaultExpense";
import { todayDateKey } from "@/shared/utils/dates";

export function useVaultExpenses(vaultId?: string) {
  const { user } = useAuth();
  const uid = user?.uid;
  const userName = user?.displayName || user?.email?.split("@")[0] || "User";

  const [expenses, setExpenses] = useState<VaultExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

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
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.vaultExpenses",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load vault expenses."
      )
    );

    return () => unsubscribe();
  }, [vaultId, attempt]);

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
          date: params.date || todayDateKey(),
          createdBy: uid,
          createdByName: userName,
          createdAt: serverTimestamp(),
        };

        const docRef = doc(collection(db, "vaults", vaultId, "expenses"));
        const outcome = await commitWrite(() => setDoc(docRef, payload), {
          label: "vault transaction",
        });
        toast.success(
          writeSavedMessage(
            outcome,
            params.type === "deposit" ? "Deposit recorded" : "Withdrawal recorded"
          )
        );
        return docRef.id;
      } catch (err: any) {
        logError("vaultExpenses.addingVaultTransaction", err);
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
        const outcome = await commitWrite(
          () => deleteDoc(doc(db, "vaults", vaultId, "expenses", expenseId)),
          { label: "vault transaction deletion" }
        );
        toast.success(writeSavedMessage(outcome, "Transaction removed"));
        return true;
      } catch (err: any) {
        logError("vaultExpenses.deletingVaultTransaction", err);
        toast.error("Failed to delete transaction");
        return false;
      }
    },
    [vaultId]
  );

  return {
    error,
    retry,
    expenses,
    loading,
    addVaultExpense,
    deleteVaultExpense,
  };
}
