import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/lib/toast";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";
import { fetchMarketQuote } from "@/services/marketDataService";
import {
  SipPlan,
  SipTransaction,
  VirtualPosition,
  AppNotification,
  SipStatus,
  SipFrequency,
  SipAssetType,
} from "@/shared/features/sip/types";
import { InstrumentType } from "@/shared/features/portfolio/types";

function calculateNextExecutionDate(
  frequency: SipFrequency,
  executionDay: number,
  fromDate: Date = new Date()
): Date {
  const nextDate = new Date(fromDate);
  
  if (frequency === "daily") {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === "weekly") {
    const currentDay = nextDate.getDay();
    let diff = executionDay - currentDay;
    if (diff <= 0) diff += 7;
    nextDate.setDate(nextDate.getDate() + diff);
  } else if (frequency === "monthly") {
    if (nextDate.getDate() >= executionDay) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  } else if (frequency === "quarterly") {
    nextDate.setMonth(nextDate.getMonth() + 3);
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  } else if (frequency === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  }
  
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

export function useSips(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const enabled = options?.enabled ?? true;

  const [plans, setPlans] = useState<SipPlan[]>([]);
  const [transactions, setTransactions] = useState<SipTransaction[]>([]);
  const [virtualPositions, setVirtualPositions] = useState<VirtualPosition[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

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
        console.error("Failed to create SIP Plan", err);
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
        console.error("Failed to toggle SIP Plan", err);
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
        console.error("Failed to delete SIP Plan", err);
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
        console.error("Failed to skip next execution", err);
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
        console.error("Failed to mark notification as read", err);
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
      console.error("Failed to clear notifications", err);
      toast.error("Failed to clear notifications");
    }
  }, [uid]);

  const triggerManualExecute = useCallback(async () => {
    const db = getFirestoreDb();
    if (!uid || !db) return;

    try {
      const snapshot = await getDocs(collection(db, `users/${uid}/sipPlans`));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const batch = writeBatch(db);
      let executedCount = 0;

      for (const d of snapshot.docs) {
        const plan = d.data() as SipPlan;
        if (plan.status !== "active") continue;

        const nextDate = new Date(plan.nextExecutionDate);
        nextDate.setHours(0, 0, 0, 0);

        if (nextDate <= today) {
          if (plan.skipNextExecution) {
            // Just advance date
            const newNextDate = calculateNextExecutionDate(plan.frequency, plan.executionDay, nextDate);
            batch.update(d.ref, {
              skipNextExecution: false,
              nextExecutionDate: newNextDate.toISOString(),
              updatedAt: serverTimestamp(),
            });
            
            // Add skipped notification
            const notifRef = doc(collection(db, `users/${uid}/notifications`));
            batch.set(notifRef, {
              id: notifRef.id,
              type: "sip_skipped",
              title: "SIP Skipped",
              body: `Skipped execution for ${plan.assetName}`,
              read: false,
              createdAt: serverTimestamp(),
              meta: { sipId: plan.id, symbol: plan.symbol }
            });
            
            continue;
          }

          // Execute
          const quote = await fetchMarketQuote(plan.symbol, plan.assetType as InstrumentType);
          const price = quote?.currentPrice || 100;

          const units = plan.investmentAmount / price;
          const newTotalInvested = (plan.totalInvested || 0) + plan.investmentAmount;
          const newTotalUnits = (plan.totalUnits || 0) + units;
          
          // Transaction
          const txRef = doc(collection(db, `users/${uid}/sipTransactions`));
          const tx: SipTransaction = {
            id: txRef.id,
            sipId: plan.id,
            date: new Date().toISOString(),
            assetType: plan.assetType,
            symbol: plan.symbol,
            quoteKey: plan.quoteKey,
            assetName: plan.assetName,
            marketPrice: price,
            investmentAmount: plan.investmentAmount,
            unitsPurchased: units,
            totalUnitsAfterPurchase: newTotalUnits,
            averageBuyPriceAfter: newTotalInvested / newTotalUnits,
            status: "executed",
            message: "Manual execution",
            createdAt: serverTimestamp()
          };
          batch.set(txRef, tx);

          // Position
          const vpId = plan.quoteKey; // Grouping by quoteKey
          const vpRef = doc(db, `users/${uid}/virtualPositions`, vpId);
          
          // Try to get existing VP to merge, or we can just upsert.
          // In a real app we might fetch it to merge. But for simplicity and robustness in a loop:
          // We will update it. It's better to calculate position aggregates server-side or separately, 
          // but we can increment totalUnits and totalInvested here using set with merge.
          // A proper way is fetching existing:
          const vpSnapshot = await getDocs(query(collection(db, `users/${uid}/virtualPositions`)));
          const existingVp = vpSnapshot.docs.find(v => v.id === vpId)?.data() as VirtualPosition | undefined;
          
          const newVpTotalUnits = (existingVp?.totalUnits || 0) + units;
          const newVpTotalInvested = (existingVp?.totalInvested || 0) + plan.investmentAmount;
          const newVpAvgPrice = newVpTotalInvested / newVpTotalUnits;
          
          const sipIds = existingVp?.sipIds || [];
          if (!sipIds.includes(plan.id)) sipIds.push(plan.id);

          const newVp: VirtualPosition = {
            id: vpId,
            assetType: plan.assetType,
            symbol: plan.symbol,
            quoteKey: plan.quoteKey,
            assetName: plan.assetName,
            totalUnits: newVpTotalUnits,
            averageBuyPrice: newVpAvgPrice,
            totalInvested: newVpTotalInvested,
            sipIds,
            updatedAt: serverTimestamp(),
          };
          batch.set(vpRef, newVp, { merge: true });

          // Update Plan
          const newNextDate = calculateNextExecutionDate(plan.frequency, plan.executionDay, nextDate);
          batch.update(d.ref, {
            totalInvested: newTotalInvested,
            totalUnits: newTotalUnits,
            executionCount: (plan.executionCount || 0) + 1,
            lastExecutionDate: new Date().toISOString(),
            nextExecutionDate: newNextDate.toISOString(),
            updatedAt: serverTimestamp(),
          });
          
          // Notification
          const notifRef = doc(collection(db, `users/${uid}/notifications`));
          batch.set(notifRef, {
            id: notifRef.id,
            type: "sip_executed",
            title: "SIP Executed",
            body: `Successfully invested ${plan.currency} ${plan.investmentAmount} in ${plan.assetName}`,
            read: false,
            createdAt: serverTimestamp(),
            meta: { sipId: plan.id, amount: plan.investmentAmount, units, price, symbol: plan.symbol }
          });

          executedCount++;
        }
      }

      await batch.commit();
      if (executedCount > 0) {
        toast.success(`Executed ${executedCount} pending SIP(s)`);
      }
    } catch (err) {
      console.error("Failed manual execute", err);
      toast.error("Failed to run manual execution");
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
