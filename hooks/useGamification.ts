import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { useExpenses } from "@/hooks/useExpenses";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { UserStats } from "@/shared/types/stats";
import { LEVEL_THRESHOLDS } from "@/shared/types/stats";
import { todayDateKey } from "@/shared/utils/dates";

export function useGamification() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { expenses } = useExpenses();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const statsRef = doc(db, "users", uid, "stats", "summary");

    const unsubscribe = onSnapshot(
      statsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setStats(docSnap.data() as UserStats);
        } else {
          // Initialize default stats
          const defaultStats: UserStats = {
            currentStreak: 1,
            longestStreak: 1,
            lastLoginDate: todayDateKey(),
            points: 120,
            level: 1,
            badges: ["no_spend"],
            shields: 1,
            fires: 1,
            focusStreak: 0,
            focusWins: 0,
            monthlyRecords: {},
          };
          setDoc(statsRef, defaultStats).catch(() => undefined);
          setStats(defaultStats);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Error fetching user stats:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // Derived user level & XP
  const levelInfo = useMemo(() => {
    const points = stats?.points || 120;
    let currentLevel = 1;

    Object.entries(LEVEL_THRESHOLDS).forEach(([lvl, threshold]) => {
      if (points >= threshold) {
        currentLevel = Math.max(currentLevel, Number(lvl));
      }
    });

    const nextThreshold =
      LEVEL_THRESHOLDS[(currentLevel + 1) as keyof typeof LEVEL_THRESHOLDS] ||
      10000;
    const prevThreshold =
      LEVEL_THRESHOLDS[currentLevel as keyof typeof LEVEL_THRESHOLDS] || 0;
    const progress = Math.min(
      100,
      Math.round(
        ((points - prevThreshold) / (nextThreshold - prevThreshold)) * 100
      )
    );

    const levelTitles: Record<number, string> = {
      1: "Financial Novice",
      2: "Budget Tracker",
      3: "Smart Saver",
      4: "Wealth Builder",
      5: "Financial Ninja",
      6: "Master Investor",
      7: "Wealth Commander",
      8: "Financial Titan",
      9: "Monetary Guru",
      10: "Financial Legend",
    };

    return {
      level: currentLevel,
      title: levelTitles[currentLevel] || "Financial Master",
      points,
      nextThreshold,
      progress,
    };
  }, [stats]);

  return {
    stats,
    levelInfo,
    loading,
  };
}
