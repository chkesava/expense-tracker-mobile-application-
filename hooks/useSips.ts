import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { logError, friendlyErrorMessage } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/lib/toast";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import { executeDueSips } from "@/services/sip/executeSips";
import { calculateNextExecutionDate } from "@/shared/features/sip/utils/sipExecution";
import {
  SipPlan,
  SipTransaction,
  VirtualPosition,
  AppNotification,
  SipStatus,
} from "@/shared/features/sip/types";

export function useSips(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const enabled = options?.enabled ?? true;

  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [transactions, setTransactions] = useState<SipTransaction[]>([]);
  const [virtualPositions, setVirtualPositions] = useState<VirtualPosition[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const executingRef = useRef(false);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setPlans([]);
      setTransactions([]);
      setVirtualPositions([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Primary: plans + virtual positions for SIP UI first paint
    const unsubPlans = onSnapshot(collection(db, `users/${uid}/sipPlans`), (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SipPlan)));
      setLoading(false);
    });

    const unsubVP = onSnapshot(collection(db, `users/${uid}/virtualPositions`), (snap) => {
      setVirtualPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VirtualPosition)));
    });

    let unsubTx: (() => void) | undefined;
    let unsubNotif: (() => void) | undefined;

    const cancelIdle = scheduleIdleWork(
      () => {
        unsubTx = onSnapshot(collection(db, `users/${uid}/sipTransactions`), (snap) => {
          setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SipTransaction)));
        });
        unsubNotif = onSnapshot(collection(db, `users/${uid}/notifications`), (snap) => {
          setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification)));
        });
      },
      { fallbackDelayMs: 900, timeoutMs: 2500 }
    );

    return () => {
      cancelIdle();
      unsubPlans();
      unsubVP();
      unsubTx?.();
      unsubNotif?.();
    };
  }, [uid, enabled]);

  const createSipPlan = useCallback(
    async (
      planData: Omit<
        SipPlan,
        "id" | "createdAt" | "updatedAt" | "totalInvested" | "totalUnits" | "executionCount" | "nextExecutionDate"
      >
    ) => {
      const db = getFirestoreDb();
      if (!uid || !db) return null;
      try {
        const nextDate = calculateNextExecutionDate(planData.frequency, planData.executionDay);
        const newDocRef = doc(collection(db, `users/${uid}/sipPlans`));
        const newPlan: SipPlan = {
          ...planData,
          id: newDocRef.id,
          totalInvested: 0,
          totalUnits: 0,
          executionCount: 0,
          nextExecutionDate: nextDate.toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(newDocRef, newPlan);
        toast.success("SIP Plan created successfully");
        return newDocRef.id;
      } catch (err: any) {
        logError("sips.createSipPlan", err);
        toast.error("Failed to create SIP Plan");
        return null;
      }
    },
    [uid]
  );

  const toggleSipPlan = useCallback(
    async (id: string, currentStatus: SipStatus) => {
      const db = getFirestoreDb();
      if (!uid || !db) return;
      try {
        const newStatus: SipStatus = currentStatus === "active" ? "paused" : "active";
        await updateDoc(doc(db, `users/${uid}/sipPlans`, id), {
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        logError("sips.toggleSipPlan", err);
        toast.error("Failed to toggle SIP Plan status");
      }
    },
    [uid]
  );

  const deleteSipPlan = useCallback(
    async (id: string) => {
      const db = getFirestoreDb();
      if (!uid || !db) return;
      try {
        await deleteDoc(doc(db, `users/${uid}/sipPlans`, id));
        toast.success("SIP Plan deleted");
      } catch (err) {
        logError("sips.deleteSipPlan", err);
        toast.error("Failed to delete SIP Plan");
      }
    },
    [uid]
  );

  const skipNextExecution = useCallback(
    async (id: string, currentVal: boolean) => {
      const db = getFirestoreDb();
      if (!uid || !db) return;
      try {
        await updateDoc(doc(db, `users/${uid}/sipPlans`, id), {
          skipNextExecution: !currentVal,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        logError("sips.skipNextExecution", err);
        toast.error("Failed to update execution setting");
      }
    },
    [uid]
  );

  const markNotificationAsRead = useCallback(
    async (id: string) => {
      const db = getFirestoreDb();
      if (!uid || !db) return;
      try {
        await updateDoc(doc(db, `users/${uid}/notifications`, id), {
          read: true,
        });
      } catch (err) {
        logError("sips.markNotificationAsRead", err);
      }
    },
    [uid]
  );

  const clearAllNotifications = useCallback(async () => {
    const db = getFirestoreDb();
    if (!uid || !db) return;
    try {
      const snapshot = await getDocs(collection(db, `users/${uid}/notifications`));
      const batch = writeBatch(db);
      snapshot.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      toast.success("Cleared all notifications");
    } catch (err) {
      logError("sips.clearNotifications", err);
      toast.error("Failed to clear notifications");
    }
  }, [uid]);

  const triggerManualExecute = useCallback(async () => {
    const db = getFirestoreDb();
    if (!uid || !db || executingRef.current) return;
    executingRef.current = true;
    try {
      const result = await executeDueSips(uid);
      if (result.executed > 0) {
        toast.success(`Executed ${result.executed} pending SIP(s)`);
      } else if (result.failed > 0) {
        toast.error("Quote unavailable — no units were recorded at a made-up price");
      } else if (result.completed > 0) {
        toast.success("Due SIP(s) marked completed");
      }
    } catch (err) {
      logError("sips.manualExecute", err);
      toast.error(friendlyErrorMessage(err, "Failed to run manual execution"));
    } finally {
      executingRef.current = false;
    }
  }, [uid]);

  return {
    plans,
    transactions,
    virtualPositions,
    notifications,
    loading,
    createSipPlan,
    toggleSipPlan,
    deleteSipPlan,
    skipNextExecution,
    markNotificationAsRead,
    clearAllNotifications,
    triggerManualExecute,
  };
}
