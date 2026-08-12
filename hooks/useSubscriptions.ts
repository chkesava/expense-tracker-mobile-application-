import { useCallback, useEffect, useRef, useState } from "react";
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
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
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
        setLoading(false);
      },
      (error) => {
        console.error("useSubscriptions error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid, enabled]);

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
        if (action.markCompleted) {
          subUpdates.isCompleted = true;
          subUpdates.isActive = false;
        }
        batch.update(subRef, subUpdates);
        await batch.commit();
      }

      for (const sub of subscriptions) {
        if (!sub.id) continue;
        if (sub.source === "sms") continue;
        if (plan.some((a) => a.subscriptionId === sub.id)) continue;
        const evaluation = evaluateSubscriptionDue(sub, now);
        if (evaluation.isCompleted && !sub.isCompleted) {
          const subRef = doc(db, "users", uid, "subscriptions", sub.id);
          await updateDoc(subRef, {
            isCompleted: true,
            isActive: false,
          });
        }
      }
    } catch (err) {
      console.error("Failed processing due subscriptions:", err);
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
      const docRef = await addDoc(collection(db, "users", uid, "subscriptions"), {
        ...sub,
        createdAt: serverTimestamp(),
      });
      toast.success("Subscription added");
      return docRef.id;
    } catch (err) {
      console.error("addSubscription error:", err);
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
      await updateDoc(doc(db, "users", uid, "subscriptions", id), updates);
      toast.success("Subscription updated");
      return true;
    } catch (err) {
      console.error("updateSubscription error:", err);
      toast.error("Failed to update subscription");
      return false;
    }
  };

  const deleteSubscription = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const existing = subscriptions.find((sub) => sub.id === id);
      await deleteDoc(doc(db, "users", uid, "subscriptions", id));
      if (existing?.source === "sms") {
        void import("@/services/sms/smsRecurringSync").then((m) =>
          m.rememberDeletedSmsSubscription(existing)
        );
      }
      toast.success("Subscription deleted");
      return true;
    } catch (err) {
      console.error("deleteSubscription error:", err);
      toast.error("Failed to delete subscription");
      return false;
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    return updateSubscription(id, { isActive: !currentStatus });
  };

  return {
    subscriptions,
    loading,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    toggleActive,
    processDueSubscriptions,
  };
}
