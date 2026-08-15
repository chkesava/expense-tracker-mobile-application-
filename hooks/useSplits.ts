import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  or,
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
import type { Participant, Split } from "@/shared/types/split";
import { currentMonthKey } from "@/shared/utils/dates";
import { computeSplitProgress } from "@/shared/utils/splitMath";

export function useSplits(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [splits, setSplits] = useState<Split[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setSplits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Query splits where user is the creator OR a participant
    const q = query(
      collection(db, "splits"),
      or(
        where("createdBy", "==", uid),
        where("participantIds", "array-contains", uid)
      )
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Split[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Split, "id">),
        }));
        // Sort by createdAt descending
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSplits(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.splits",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your splits."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt]);

  const createSplit = async (
    splitData: Omit<Split, "id" | "createdAt" | "createdBy" | "participantIds" | "settled">,
    options?: { createPersonalExpense?: boolean; accountId?: string }
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) return null;

    try {
      const participantIds = splitData.participants
        .map((p) => p.userId)
        .filter((id): id is string => Boolean(id));

      if (!participantIds.includes(uid)) {
        participantIds.push(uid);
      }

      const newSplit: Omit<Split, "id"> = {
        ...splitData,
        createdBy: uid,
        createdByName: user?.displayName || user?.email?.split("@")[0] || "Me",
        createdAt: Date.now(),
        participantIds,
        settled: false,
      };

      const docRef = await addDoc(collection(db, "splits"), newSplit);

      // Create linked personal expense if requested
      if (options?.createPersonalExpense) {
        const creatorParticipant = splitData.participants.find((p) => p.isCurrentUser);
        const creatorShare = creatorParticipant?.amount || 0;

        if (creatorShare > 0) {
          const now = new Date();
          const dateStr = now.toISOString().split("T")[0];
          const monthStr = currentMonthKey();

          await addDoc(collection(db, "users", uid, "expenses"), {
            amount: creatorShare,
            category: splitData.category || "Food & Dining",
            subcategory: "Dining Out",
            note: `[Split Share] ${splitData.title}`,
            date: dateStr,
            month: monthStr,
            splitId: docRef.id,
            accountId: options.accountId || undefined,
            createdAt: serverTimestamp(),
          });
        }
      }

      toast.success("Split created successfully");
      return docRef.id;
    } catch (err) {
      logError("splits.createsplit", err);
      toast.error("Failed to create split");
      return null;
    }
  };

  const updateSplit = async (
    id: string,
    updates: Partial<Split>
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      await updateDoc(doc(db, "splits", id), updates);
      toast.success("Split updated");
      return true;
    } catch (err) {
      logError("splits.updatesplit", err);
      toast.error("Failed to update split");
      return false;
    }
  };

  const toggleParticipantPaid = async (
    splitId: string,
    participantIndex: number,
    newPaid: boolean
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const updatedParticipants = split.participants.map((p, idx) => {
      if (idx === participantIndex) {
        return { ...p, paid: newPaid };
      }
      return p;
    });

    const isAllPaid = updatedParticipants.every((p) => p.paid);

    try {
      await updateDoc(doc(db, "splits", splitId), {
        participants: updatedParticipants,
        settled: isAllPaid,
      });
      return true;
    } catch (err) {
      logError("splits.toggleparticipantpaid", err);
      toast.error("Failed to update settlement status");
      return false;
    }
  };

  const settleAll = async (splitId: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !splitId) return false;

    const split = splits.find((s) => s.id === splitId);
    if (!split) return false;

    const updatedParticipants = split.participants.map((p) => ({
      ...p,
      paid: true,
    }));

    try {
      await updateDoc(doc(db, "splits", splitId), {
        participants: updatedParticipants,
        settled: true,
      });
      toast.success("Split marked as fully settled!");
      return true;
    } catch (err) {
      logError("splits.settleall", err);
      toast.error("Failed to settle split");
      return false;
    }
  };

  const deleteSplit = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      await deleteDoc(doc(db, "splits", id));
      toast.success("Split deleted");
      return true;
    } catch (err) {
      logError("splits.deletesplit", err);
      toast.error("Failed to delete split");
      return false;
    }
  };

  return {
    error,
    retry,
    splits,
    loading,
    createSplit,
    updateSplit,
    toggleParticipantPaid,
    settleAll,
    deleteSplit,
  };
}
