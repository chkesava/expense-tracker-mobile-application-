import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { useExpenses } from "@/hooks/useExpenses";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { commitWrite } from "@/lib/firestoreWrite";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { createDefaultUserStats, LEVEL_THRESHOLDS, type UserStats } from "@/shared/types/stats";
import { todayDateKey } from "@/shared/utils/dates";
import { buildLoggingStreakUpdate } from "@/shared/utils/expenseStreak";

export function useGamification() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const { expenses, loading: expensesLoading } = useExpenses();
  const todayKey = todayDateKey(settings.timezone);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const persistKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setStats(null);
      setHydrated(false);
      setLoading(false);
      persistKeyRef.current = null;
      return;
    }

    setLoading(true);
    setHydrated(false);
    const statsRef = doc(db, "users", uid, "stats", "summary");

    const unsubscribe = onSnapshot(
      statsRef,
      (docSnap) => {
        setStats(docSnap.exists() ? (docSnap.data() as UserStats) : null);
        setError(null);
        setHydrated(true);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.gamification",
        (failure) => {
          setError(failure);
          setHydrated(false);
          setLoading(false);
        },
        "Couldn't load your progress."
      )
    );

    return () => unsubscribe();
  }, [uid, attempt, setError]);

  const expensesReady = !expensesLoading || expenses.length > 0;
  const defaults = useMemo(() => createDefaultUserStats(todayKey), [todayKey]);

  const streakUpdate = useMemo(() => {
    if (!expensesReady) {
      const fallback = stats ?? defaults;
      return {
        next: fallback,
        shouldPersist: false,
        persistPatch: {
          currentStreak: fallback.currentStreak,
          longestStreak: fallback.longestStreak,
          badges: fallback.badges,
          lastLoginDate: fallback.lastLoginDate,
        },
      };
    }
    return buildLoggingStreakUpdate(stats, expenses, todayKey, defaults);
  }, [defaults, expenses, expensesReady, stats, todayKey]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db || !hydrated || !expensesReady || !streakUpdate.shouldPersist) {
      return;
    }

    const persistKey = `${streakUpdate.persistPatch.currentStreak}:${streakUpdate.persistPatch.longestStreak}:${streakUpdate.persistPatch.badges.join(",")}:${streakUpdate.persistPatch.lastLoginDate}`;
    if (persistKeyRef.current === persistKey) return;
    persistKeyRef.current = persistKey;

    const statsRef = doc(db, "users", uid, "stats", "summary");
    const payload =
      stats == null
        ? streakUpdate.next
        : streakUpdate.persistPatch;

    void commitWrite(
      () => setDoc(statsRef, payload, { merge: true }),
      { label: "logging streak" }
    );
  }, [
    expensesReady,
    hydrated,
    stats,
    streakUpdate.next,
    streakUpdate.persistPatch,
    streakUpdate.shouldPersist,
    uid,
  ]);

  const displayStats = streakUpdate.next;

  // Derived user level & XP
  const levelInfo = useMemo(() => {
    const points = displayStats.points || 120;
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
  }, [displayStats]);

  return {
    error,
    retry,
    stats: displayStats,
    levelInfo,
    loading,
  };
}
