import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firestore";
import { logError, friendlyErrorMessage } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useNotificationRows } from "@/hooks/useNotificationRows";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { noteDirectWrites } from "@/lib/readModelWriteHooks";
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
  // SPENDLY-598: firestore (default) | shadow | supabase, per readModel.<collection>.
  const plansSource = useReadModelSource("sipPlans");
  const positionsSource = useReadModelSource("virtualPositions");
  const sipTxSource = useReadModelSource("sipTransactions");
  const enabled = options?.enabled ?? true;

  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [transactions, setTransactions] = useState<SipTransaction[]>([]);
  const [virtualPositions, setVirtualPositions] = useState<VirtualPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const executingRef = useRef(false);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setPlans([]);
      setTransactions([]);
      setVirtualPositions([]);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // SPENDLY-598: the same mapping for either source. SIP execution
    // (executeDueSips) reads plans and positions from Firestore itself (R4.3a).
    const applyPlans = (docs: SourceDoc[]) => {
      setPlans(docs.map((d) => ({ id: d.id, ...d.data } as SipPlan)));
      setLoading(false);
    };
    const applyVP = (docs: SourceDoc[]) => setVirtualPositions(docs.map((d) => ({ id: d.id, ...d.data } as VirtualPosition)));
    const applyTx = (docs: SourceDoc[]) => setTransactions(docs.map((d) => ({ id: d.id, ...d.data } as SipTransaction)));

    // Primary: plans + virtual positions for SIP UI first paint
    const unsubPlans = plansSource.mode === "supabase"
      ? plansSource.subscribe(applyPlans)
      : onSnapshot(collection(db, `users/${uid}/sipPlans`), (snap) => {
      const docs = toSourceDocs(snap);
      applyPlans(docs);
      if (plansSource.mode === "shadow") void plansSource.shadow(docs);
    });

    const unsubVP = positionsSource.mode === "supabase"
      ? positionsSource.subscribe(applyVP)
      : onSnapshot(collection(db, `users/${uid}/virtualPositions`), (snap) => {
      const docs = toSourceDocs(snap);
      applyVP(docs);
      if (positionsSource.mode === "shadow") void positionsSource.shadow(docs);
    });

    let unsubTx: (() => void) | undefined;

    const cancelIdle = scheduleIdleWork(
      () => {
        unsubTx = sipTxSource.mode === "supabase"
          ? sipTxSource.subscribe(applyTx)
          : onSnapshot(collection(db, `users/${uid}/sipTransactions`), (snap) => {
          const docs = toSourceDocs(snap);
          applyTx(docs);
          if (sipTxSource.mode === "shadow") void sipTxSource.shadow(docs);
        });
      },
      { fallbackDelayMs: 900, timeoutMs: 2500 }
    );

    return () => {
      cancelIdle();
      unsubPlans();
      unsubVP();
      unsubTx?.();
    };
  }, [uid, enabled, plansSource.mode, positionsSource.mode, sipTxSource.mode]);

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
        noteDirectWrites(uid, [newDocRef.path]);
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
        noteDirectWrites(uid, [`users/${uid}/sipPlans/${id}`]);
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
        noteDirectWrites(uid, [`users/${uid}/sipPlans/${id}`]);
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
        noteDirectWrites(uid, [`users/${uid}/sipPlans/${id}`]);
      } catch (err) {
        logError("sips.skipNextExecution", err);
        toast.error("Failed to update execution setting");
      }
    },
    [uid]
  );

  // SPENDLY-230: the rows come from the shared, read-switched hook (one
  // listener with the inbox); marking read and clearing reach the read model.
  const notificationRows = useNotificationRows({ enabled });
  const notifications: AppNotification[] = useMemo(
    () =>
      notificationRows.rows.map((r) => ({
        id: r.id,
        type: (["sip_executed", "sip_failed", "sip_skipped"].includes(r.type) ? r.type : "info") as AppNotification["type"],
        title: r.title,
        body: r.body,
        read: r.read,
        createdAt: r.createdAtMs,
        meta: (r.meta ?? undefined) as AppNotification["meta"],
      })),
    [notificationRows.rows]
  );
  const { markRead, clearAll } = notificationRows;

  const markNotificationAsRead = useCallback((id: string) => markRead([id]), [markRead]);

  const clearAllNotifications = useCallback(async () => {
    if (await clearAll()) toast.success("Cleared all notifications");
    else toast.error("Failed to clear notifications");
  }, [clearAll]);

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
