import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { FocusSession } from "@/shared/types/focus";

export function useFocusMode() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const sessionRef = doc(db, "users", uid, "focus", "active");

    const unsubscribe = onSnapshot(
      sessionRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as FocusSession;
          if (data.status === "active") {
            setActiveSession(data);
          } else {
            setActiveSession(null);
          }
        } else {
          setActiveSession(null);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Error reading focus session:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const startFocusSession = useCallback(
    async (params: {
      category: string;
      dailyLimit: number;
      durationDays: number;
    }) => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      const startDate = new Date();
      const endDate = new Date(
        startDate.getTime() + params.durationDays * 24 * 60 * 60 * 1000
      );

      const session: FocusSession = {
        id: `focus_${Date.now()}`,
        category: params.category,
        dailyLimit: params.dailyLimit,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        durationDays: params.durationDays,
        status: "active",
        currentSpend: 0,
        daysSuccessful: 0,
        lastCheckDate: startDate.toISOString().slice(0, 10),
      };

      try {
        await setDoc(doc(db, "users", uid, "focus", "active"), session);
        toast.success(`Focus Sprint started for ${params.durationDays} days!`);
        return true;
      } catch (err) {
        console.error("Failed starting focus sprint:", err);
        toast.error("Failed to start sprint");
        return false;
      }
    },
    [uid]
  );

  const endFocusSession = useCallback(
    async (status: "completed" | "abandoned" = "abandoned") => {
      const db = getFirestoreDb();
      if (!uid || !db || !activeSession) return false;

      try {
        await setDoc(
          doc(db, "users", uid, "focus", "active"),
          {
            ...activeSession,
            status,
          },
          { merge: true }
        );
        toast.success(
          status === "completed" ? "Focus Sprint Completed! 🎯" : "Sprint Ended"
        );
        return true;
      } catch (err) {
        console.error("Failed updating focus session:", err);
        return false;
      }
    },
    [uid, activeSession]
  );

  return {
    activeSession,
    loading,
    startFocusSession,
    endFocusSession,
  };
}
