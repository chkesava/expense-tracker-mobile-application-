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
import type { CategorizationRule } from "@/shared/types/expense";

export const useCategorizationRules = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setRules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "categorizationRules"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(
      q,
      (snap) => {
        setRules(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as CategorizationRule))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.categorizationRules",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your categorization rules."
      )
    );
  }, [uid, enabled, attempt]);

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
