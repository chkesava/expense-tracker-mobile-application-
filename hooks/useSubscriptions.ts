import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Subscription } from "@/shared/types/subscription";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import {
  evaluateSubscriptionDue,
  planDueSubscriptionPosts,
} from "@/shared/utils/subscriptionProcessor";

export function useSubscriptions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const isProcessingRef = useRef(false);

  // Firestore listener
  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setSubscriptions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", uid, "subscriptions"),
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Subscription[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Subscription, "id">),
        }));
        setSubscriptions(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.subscriptions",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your subscriptions."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt]);

  // Process due subscriptions in background after idle
  const processDueSubscriptions = useCallback(async () => {
    const db = getFirestoreDb();
    if (!uid || !db || isProcessingRef.current || subscriptions.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    try {
      const now = new Date();
      const plan = planDueSubscriptionPosts(subscriptions, now);

      for (const action of plan) {
        if (!action.subscriptionId) continue;
        const batch = writeBatch(db);

        if (action.kind === "transfer") {
          const newTransferRef = doc(
            collection(db, "users", uid, "accountTransfers")
          );
          batch.set(newTransferRef, {
            ...action.transfer,
            createdAt: serverTimestamp(),
          });
        } else {
          const newExpenseRef = doc(collection(db, "users", uid, "expenses"));
          batch.set(newExpenseRef, {
            ...action.expense,
            createdAt: serverTimestamp(),
          });
        }

        const subRef = doc(
          db,
          "users",
          uid,
          "subscriptions",
          action.subscriptionId
        );
        const subUpdates: Record<string, unknown> = {
          lastProcessed: action.monthKey,
        };
        if (action.lastProcessedDate) {
          subUpdates.lastProcessedDate = action.lastProcessedDate;
        }
        if (action.markCompleted) {
          subUpdates.isCompleted = true;
          subUpdates.isActive = false;
        }
        batch.update(subRef, subUpdates);
        // The charge and its `lastProcessed` marker are one atomic batch, so a
        // queued commit can never double-charge a subscription on replay.
        await commitWrite(() => batch.commit(), { label: "subscription charge" });
      }

      for (const sub of subscriptions) {
        if (!sub.id) continue;
        if (sub.source === "sms") continue;
        if (plan.some((a) => a.subscriptionId === sub.id)) continue;
        const evaluation = evaluateSubscriptionDue(sub, now);
        if (evaluation.isCompleted && !sub.isCompleted) {
          const subRef = doc(db, "users", uid, "subscriptions", sub.id);
          await commitWrite(
            () =>
              updateDoc(subRef, {
                isCompleted: true,
                isActive: false,
              }),
            { label: "subscription" }
          );
        }
      }
    } catch (err) {
      logError("subscriptions.processingDueSubscriptions", err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [uid, subscriptions]);

  // Idle background execution
  useEffect(() => {
    if (!loading && subscriptions.length > 0) {
      const cancel = scheduleIdleWork(() => {
        processDueSubscriptions();
      }, { timeoutMs: 3000, fallbackDelayMs: 1500 });

      return cancel;
    }
  }, [loading, subscriptions.length, processDueSubscriptions]);

  // CRUD Methods
  const addSubscription = async (
    sub: Omit<Subscription, "id">
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) return null;

    try {
      const docRef = doc(collection(db, "users", uid, "subscriptions"));
      const outcome = await commitWrite(
        () => setDoc(docRef, { ...sub, createdAt: serverTimestamp() }),
        { label: "subscription" }
      );
      toast.success(writeSavedMessage(outcome, "Subscription added"));
      return docRef.id;
    } catch (err) {
      logError("subscriptions.addsubscription", err);
      toast.error("Failed to add subscription");
      return null;
    }
  };

  const updateSubscription = async (
    id: string,
    updates: Partial<Subscription>
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () => updateDoc(doc(db, "users", uid, "subscriptions", id), updates),
        { label: "subscription" }
      );
      toast.success(writeSavedMessage(outcome, "Subscription updated"));
      return true;
    } catch (err) {
      logError("subscriptions.updatesubscription", err);
      toast.error("Failed to update subscription");
      return false;
    }
  };

  const deleteSubscription = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const existing = subscriptions.find((sub) => sub.id === id);
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "users", uid, "subscriptions", id)),
        { label: "subscription deletion" }
      );
      if (existing?.name) {
        void import("@/services/sms/smsRecurringSync").then((m) =>
          m.rememberDeletedSubscription(uid, existing)
        );
      }
      toast.success(writeSavedMessage(outcome, "Subscription deleted"));
      return true;
    } catch (err) {
      logError("subscriptions.deletesubscription", err);
      toast.error("Failed to delete subscription");
      return false;
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    return updateSubscription(id, { isActive: !currentStatus });
  };

  return {
    error,
    retry,
    subscriptions,
    loading,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    toggleActive,
    processDueSubscriptions,
  };
}
