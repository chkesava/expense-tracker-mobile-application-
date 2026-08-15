import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { SharedVault } from "@/shared/types/vault";

export function useVaults(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [vaults, setVaults] = useState<SharedVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);
  // Bumped by `retry()` to tear down and re-establish the listener.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setVaults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    // Query vaults where user is owner or member
    const q = query(
      collection(db, "vaults"),
      or(
        where("ownerId", "==", uid),
        where("memberIds", "array-contains", uid)
      )
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: SharedVault[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<SharedVault, "id">),
        }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setVaults(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.vaults",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your vaults."
      )
    );

    return () => unsubscribe();
  }, [uid, enabled, attempt]);

  const createVault = useCallback(
    async (params: {
      name: string;
      description?: string;
      budget: number;
      currency?: string;
      memberIds?: string[];
      themeColor?: string;
    }) => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const newVault: Omit<SharedVault, "id"> = {
          name: params.name.trim(),
          description: params.description?.trim() || "",
          budget: params.budget,
          currency: params.currency || "INR",
          memberIds: Array.from(new Set([uid, ...(params.memberIds || [])])),
          ownerId: uid,
          themeColor: params.themeColor || "#6366F1",
          createdAt: serverTimestamp(),
        };

        const docRef = doc(collection(db, "vaults"));
        const outcome = await commitWrite(() => setDoc(docRef, newVault), {
          label: "vault",
        });
        toast.success(
          writeSavedMessage(outcome, `Vault "${params.name}" created!`)
        );
        return docRef.id;
      } catch (err) {
        logError("vaults.create", err);
        toast.error(friendlyErrorMessage(err, "Couldn't create the vault."));
        return null;
      }
    },
    [uid]
  );

  const updateVault = useCallback(
    async (id: string, updates: Partial<SharedVault>) => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      try {
        const outcome = await commitWrite(
          () => updateDoc(doc(db, "vaults", id), updates),
          { label: "vault" }
        );
        toast.success(writeSavedMessage(outcome, "Vault updated"));
        return true;
      } catch (err) {
        logError("vaults.update", err);
        toast.error(friendlyErrorMessage(err, "Couldn't update the vault."));
        return false;
      }
    },
    [uid]
  );

  const deleteVault = useCallback(
    async (id: string) => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      try {
        const outcome = await commitWrite(
          () => deleteDoc(doc(db, "vaults", id)),
          { label: "vault deletion" }
        );
        toast.success(writeSavedMessage(outcome, "Vault deleted"));
        return true;
      } catch (err) {
        logError("vaults.delete", err);
        toast.error(friendlyErrorMessage(err, "Couldn't delete the vault."));
        return false;
      }
    },
    [uid]
  );

  return {
    vaults,
    loading,
    error,
    retry,
    createVault,
    updateVault,
    deleteVault,
  };
}
