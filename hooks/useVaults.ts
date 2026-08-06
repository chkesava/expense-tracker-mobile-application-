import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { SharedVault } from "@/shared/types/vault";

export function useVaults(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [vaults, setVaults] = useState<SharedVault[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setVaults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
        setLoading(false);
      },
      (err) => {
        console.warn("Error fetching vaults:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid, enabled]);

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

        const docRef = await addDoc(collection(db, "vaults"), newVault);
        toast.success(`Vault "${params.name}" created!`);
        return docRef.id;
      } catch (err: any) {
        console.error("Failed creating vault:", err);
        toast.error(err?.message || "Failed to create vault");
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
        await updateDoc(doc(db, "vaults", id), updates);
        toast.success("Vault updated");
        return true;
      } catch (err: any) {
        console.error("Failed updating vault:", err);
        toast.error("Failed to update vault");
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
        await deleteDoc(doc(db, "vaults", id));
        toast.success("Vault deleted");
        return true;
      } catch (err: any) {
        console.error("Failed deleting vault:", err);
        toast.error("Failed to delete vault");
        return false;
      }
    },
    [uid]
  );

  return {
    vaults,
    loading,
    createVault,
    updateVault,
    deleteVault,
  };
}
