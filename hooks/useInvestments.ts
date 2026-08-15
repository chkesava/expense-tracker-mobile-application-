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

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Investment } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";

export function useInvestments(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setInvestments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "investments"),
      orderBy("startDate", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Investment[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Investment, "id">),
        }));
        setInvestments(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.investments",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your investments."
      )
    );

    return () => unsubscribe();
  }, [uid, enabled, attempt]);

  const addInvestment = useCallback(
    async (params: Omit<Investment, "id">) => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const payload = {
          ...params,
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(
          collection(db, "users", uid, "investments"),
          payload
        );
        toast.success(`Investment "${params.name}" added`);
        return docRef.id;
      } catch (err: any) {
        logError("investments.addingInvestment", err);
        toast.error("Failed to add investment");
        return null;
      }
    },
    [uid]
  );

  const updateInvestment = useCallback(
    async (id: string, updates: Partial<Investment>) => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      try {
        await updateDoc(doc(db, "users", uid, "investments", id), updates);
        toast.success("Investment updated");
        return true;
      } catch (err: any) {
        logError("investments.updatingInvestment", err);
        toast.error("Failed to update investment");
        return false;
      }
    },
    [uid]
  );

  const deleteInvestment = useCallback(
    async (id: string) => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      try {
        await deleteDoc(doc(db, "users", uid, "investments", id));
        toast.success("Investment deleted");
        return true;
      } catch (err: any) {
        logError("investments.deletingInvestment", err);
        toast.error("Failed to delete investment");
        return false;
      }
    },
    [uid]
  );

  const closeInvestment = useCallback(
    async (id: string) => {
      const today = todayDateKey();
      return updateInvestment(id, {
        status: "closed",
        closedDate: today,
      });
    },
    [updateInvestment]
  );

  return {
    error,
    retry,
    investments,
    loading,
    addInvestment,
    updateInvestment,
    deleteInvestment,
    closeInvestment,
  };
}
