import { useCallback, useEffect, useState } from "react";

import { isLocalTestMode } from "@/lib/env";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { firestoreGoalEventsInRange, GOAL_EVENTS_PAGE } from "@/lib/readModel/goalSources";
import { readGoalEventsInRange, type GoalEventsRead } from "@/lib/readModel/goalsReadPath";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { GoalEvent } from "@/shared/types/goal";

type Range = { fromMs: number; toMs: number };

export type GoalAnalyticsEvents = {
  current: GoalEventsRead | null;
  previous: GoalEventsRead | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Newest event this screen holds, for the freshness badge. */
  newestMs: number | null;
};

/**
 * SPENDLY-611 — the goal events behind Analytics and exports, for one date
 * range (and the previous one when comparing). Read once per range change —
 * no listener — through the `goals` read path: the bounded Firestore range
 * read by default, the read model when the screen is flipped. Mounted only by
 * the Analytics screen, so the list and dashboard never pay for history.
 */
export function useGoalAnalyticsEvents(range: Range | null, previous: Range | null): GoalAnalyticsEvents {
  const { user, isDuress } = useAuth();
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const [current, setCurrent] = useState<GoalEventsRead | null>(null);
  const [prev, setPrev] = useState<GoalEventsRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const from = range?.fromMs;
  const to = range?.toMs;
  const pFrom = previous?.fromMs;
  const pTo = previous?.toMs;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !user || from === undefined || to === undefined) {
      setCurrent(null);
      setPrev(null);
      return;
    }
    let cancelled = false;
    const conditions = { setting: settings.readModel, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() };
    const read = (fromMs: number, toMs: number) =>
      readGoalEventsInRange({
        db,
        user,
        conditions,
        fromMs,
        toMs,
        firestore: () => firestoreGoalEventsInRange(db, user.uid, fromMs, toMs),
        recent: async (sinceMs: number): Promise<GoalEvent[]> =>
          (await firestoreGoalEventsInRange(db, user.uid, sinceMs, toMs, GOAL_EVENTS_PAGE)).events,
      });
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [c, p] = await Promise.all([read(from, to), pFrom !== undefined && pTo !== undefined ? read(pFrom, pTo) : Promise.resolve(null)]);
        if (cancelled) return;
        setCurrent(c);
        setPrev(p);
      } catch (failure) {
        logError("goalAnalytics.load", failure);
        if (!cancelled) setError(friendlyErrorMessage(failure, "Couldn't load goal history."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDuress, isOnline, settings.readModel, from, to, pFrom, pTo, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const newestMs = current?.events.reduce<number | null>((m, e) => (m === null || e.createdAtMs > m ? e.createdAtMs : m), null) ?? null;
  return { current, previous: prev, loading, error, reload, newestMs };
}
