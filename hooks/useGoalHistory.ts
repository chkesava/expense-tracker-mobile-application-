import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logDirectRead, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { GoalEvent, GoalEventType } from "@/shared/types/goal";
import { GOAL_HISTORY_PAGE_SIZE, sortGoalEvents } from "@/shared/utils/goalHistory";
import { mergeEventPages, pageMayHaveMore, pushedOutRows } from "@/shared/utils/ledgerEventPages";

/** goalId filter, optional type filter, newest first. */
function historyConstraints(goalId: string, typesKey: string): QueryConstraint[] {
  const out: QueryConstraint[] = [where("goalId", "==", goalId)];
  if (typesKey) out.push(where("type", "in", typesKey.split(",")));
  out.push(orderBy("createdAtMs", "desc"));
  return out;
}

function toEvent(docSnap: QueryDocumentSnapshot): GoalEvent {
  return { ...(docSnap.data() as Omit<GoalEvent, "id">), id: docSnap.id };
}

/**
 * One goal's history (SPENDLY-609), newest first. Mount only where the
 * timeline renders (SPENDLY-406): the list and dashboard never read history.
 *
 * Bounded: a realtime listener on the newest `GOAL_HISTORY_PAGE_SIZE` events
 * (so this device's own writes, including pending ones, appear at once — the
 * "just wrote" window stays on Firestore, READ_MODEL_RULES R4.3), and
 * `loadMore` pages older events by cursor. Needs the
 * `goalEvents (goalId, createdAtMs desc)` index.
 *
 * Older pages move to the read-model path with the `goals` screen key in
 * SPENDLY-611.
 */
export function useGoalHistory(
  goalId: string | undefined,
  options?: {
    enabled?: boolean;
    /**
     * SPENDLY-610: only these event types (e.g. achievements). Needs the
     * `goalEvents (goalId, type, createdAtMs desc)` index.
     */
    types?: readonly GoalEventType[];
  }
) {
  const enabled = options?.enabled !== false && Boolean(goalId);
  const typesKey = options?.types?.join(",") ?? "";
  const { user } = useAuth();
  const uid = user?.uid;
  const [live, setLive] = useState<GoalEvent[]>([]);
  const [older, setOlder] = useState<GoalEvent[]>([]);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();
  const liveRef = useRef<GoalEvent[]>([]);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const olderLoadedRef = useRef(false);

  useEffect(() => {
    const db = getFirestoreDb();
    liveRef.current = [];
    cursorRef.current = null;
    olderLoadedRef.current = false;
    setLive([]);
    setOlder([]);
    setHasMore(false);
    if (!uid || !db || !enabled || !goalId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/goalEvents?goalId=${goalId}&types=${typesKey}&limit=${GOAL_HISTORY_PAGE_SIZE}`;
    const q = query(collection(db, "users", uid, "goalEvents"), ...historyConstraints(goalId, typesKey), limit(GOAL_HISTORY_PAGE_SIZE));
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        logQuerySnapshot(path, snapshot, { feature: "goals", queryShape: "goal history window" });
        const rows = snapshot.docs.map(toEvent);
        // Events are never deleted: a row leaving the window was pushed out by a newer one.
        const pushed = pushedOutRows(liveRef.current, rows);
        if (pushed.length > 0 && olderLoadedRef.current) setOlder((prev) => mergeEventPages(pushed, prev));
        liveRef.current = rows;
        setLive(rows);
        setPendingIds(new Set(snapshot.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)));
        if (!olderLoadedRef.current) {
          cursorRef.current = snapshot.docs.at(-1) ?? null;
          setHasMore(pageMayHaveMore(rows.length, GOAL_HISTORY_PAGE_SIZE));
        }
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.goalEvents",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this goal's history."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, goalId, typesKey, enabled, attempt, setError]);

  const loadMore = useCallback(async () => {
    const db = getFirestoreDb();
    const cursor = cursorRef.current;
    if (!uid || !db || !goalId || loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "goalEvents"),
          ...historyConstraints(goalId, typesKey),
          startAfter(cursor),
          limit(GOAL_HISTORY_PAGE_SIZE)
        )
      );
      logDirectRead(`users/${uid}/goalEvents`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
        feature: "goals",
        queryShape: "goal history older page",
      });
      olderLoadedRef.current = true;
      cursorRef.current = snap.docs.at(-1) ?? cursor;
      setOlder((prev) => mergeEventPages(prev, snap.docs.map(toEvent)));
      setHasMore(pageMayHaveMore(snap.docs.length, GOAL_HISTORY_PAGE_SIZE));
    } catch (failure) {
      logError("goalHistory.loadMore", failure);
      toast.error(friendlyErrorMessage(failure, "Couldn't load older entries."));
    } finally {
      setLoadingMore(false);
    }
  }, [uid, goalId, typesKey, loadingMore, hasMore]);

  const events = sortGoalEvents(mergeEventPages(live, older));
  return { events, pendingIds, loading, error, retry, hasMore, loadingMore, loadMore };
}
