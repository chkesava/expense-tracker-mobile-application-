import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Space } from "@/shared/types/space";

/** Firestore caps a batch at 500 writes; stay comfortably under it. */
const BATCH_CHUNK_SIZE = 400;

export type CreateSpaceInput = Omit<
  Space,
  "id" | "userId" | "status" | "createdAt" | "updatedAt"
> & { status?: Space["status"] };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function useSpaces(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setSpaces([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "spaces"), orderBy("name")),
      (snapshot) => {
        setSpaces(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Space, "id">),
          }))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.spaces",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your spaces."
      )
    );

    return () => unsubscribe();
  }, [uid, enabled, attempt]);

  const createSpace = useCallback(
    async (input: CreateSpaceInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const ref = await addDoc(collection(db, "users", uid, "spaces"), {
          ...input,
          userId: uid,
          budget: input.budget ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          status: input.status ?? "ACTIVE",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Space "${input.name}" created`);
        return ref.id;
      } catch (err) {
        logError("spaces.createspace", err);
        toast.error("Failed to create space");
        return null;
      }
    },
    [uid]
  );

  const updateSpace = useCallback(
    async (id: string, updates: Partial<Space>): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !id) return false;

      try {
        await updateDoc(doc(db, "users", uid, "spaces", id), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
        toast.success("Space updated");
        return true;
      } catch (err) {
        logError("spaces.updatespace", err);
        toast.error("Failed to update space");
        return false;
      }
    },
    [uid]
  );

  /**
   * Deletes a Space and unlinks its expenses. Expenses themselves are never
   * deleted, they simply stop belonging to a Space.
   */
  const deleteSpace = useCallback(
    async (spaceId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !spaceId) return false;

      try {
        const linked = await getDocs(
          query(
            collection(db, "users", uid, "expenses"),
            where("spaceId", "==", spaceId)
          )
        );

        for (const group of chunk(linked.docs, BATCH_CHUNK_SIZE)) {
          const batch = writeBatch(db);
          group.forEach((expenseDoc) =>
            batch.update(expenseDoc.ref, { spaceId: null })
          );
          await batch.commit();
        }

        const finalBatch = writeBatch(db);
        finalBatch.delete(doc(db, "users", uid, "spaces", spaceId));
        await finalBatch.commit();

        toast.success("Space deleted and expenses unlinked");
        return true;
      } catch (err) {
        logError("spaces.deletespace", err);
        toast.error("Failed to delete space");
        return false;
      }
    },
    [uid]
  );

  /**
   * Assigns expenses to a Space, or clears the assignment when `spaceId` is
   * null. Re-assigning an already-assigned expense is idempotent.
   */
  const assignExpensesToSpace = useCallback(
    async (expenseIds: string[], spaceId: string | null): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || expenseIds.length === 0) return false;

      try {
        for (const group of chunk(expenseIds, BATCH_CHUNK_SIZE)) {
          const batch = writeBatch(db);
          group.forEach((expenseId) => {
            batch.update(doc(db, "users", uid, "expenses", expenseId), {
              spaceId,
            });
          });
          await batch.commit();
        }

        toast.success(
          spaceId
            ? `${expenseIds.length} expense${expenseIds.length === 1 ? "" : "s"} added to space`
            : "Removed from space"
        );
        return true;
      } catch (err) {
        logError("spaces.assignexpensestospace", err);
        toast.error("Failed to update space assignment");
        return false;
      }
    },
    [uid]
  );

  const removeExpenseFromSpace = useCallback(
    async (expenseId: string): Promise<boolean> =>
      assignExpensesToSpace([expenseId], null),
    [assignExpensesToSpace]
  );

  const archiveSpace = useCallback(
    async (spaceId: string): Promise<boolean> =>
      updateSpace(spaceId, { status: "ARCHIVED" }),
    [updateSpace]
  );

  const restoreSpace = useCallback(
    async (spaceId: string): Promise<boolean> =>
      updateSpace(spaceId, { status: "ACTIVE" }),
    [updateSpace]
  );

  return {
    error,
    retry,
    spaces,
    loading,
    createSpace,
    updateSpace,
    deleteSpace,
    assignExpensesToSpace,
    removeExpenseFromSpace,
    archiveSpace,
    restoreSpace,
  };
}
