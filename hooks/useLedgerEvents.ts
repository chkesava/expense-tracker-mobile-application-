import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { toast } from "@/lib/toast";
import { forgetSnapshotPath, logDirectRead, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { useAuth } from "@/providers/AuthProvider";
import type { LedgerEvent } from "@/shared/types/ledgerEvent";
import {
  LEDGER_EVENTS_PAGE_SIZE,
  mergeEventPages,
  pageMayHaveMore,
  pushedOutRows,
  sortEventsNewestFirst,
} from "@/shared/utils/ledgerEventPages";

function toEvent(docSnap: QueryDocumentSnapshot): LedgerEvent {
  return { ...(docSnap.data() as Omit<LedgerEvent, "id">), id: docSnap.id };
}

/**
 * Audit-tab listener for journal edits/deletes (SPENDLY-38).
 * Mount only while the Audit tab is visible — do not leave this on from the shell.
 *
 * SPENDLY-501: bounded. Without `docId` it streams the newest
 * `LEDGER_EVENTS_PAGE_SIZE` events and `loadMore` pages older ones by cursor
 * (the SPENDLY-410 pattern). With `docId` it reads only that row's events
 * (`where docId ==`, sorted client-side, so no composite index is needed).
 */
export function useLedgerEvents(options?: {
  enabled?: boolean;
  docId?: string;
}) {
  const enabled = options?.enabled !== false;
  const docId = options?.docId;
  const { user } = useAuth();
  const uid = user?.uid;

  const [live, setLive] = useState<LedgerEvent[]>([]);
  const [older, setOlder] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();

  const liveRef = useRef<LedgerEvent[]>([]);
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
    if (!uid || !enabled || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const col = collection(db, "users", uid, "ledgerEvents");
    const path = docId
      ? `users/${uid}/ledgerEvents?docId=${docId}`
      : `users/${uid}/ledgerEvents?limit=${LEDGER_EVENTS_PAGE_SIZE}`;
    const q = docId
      ? query(col, where("docId", "==", docId))
      : query(col, orderBy("createdAt", "desc"), limit(LEDGER_EVENTS_PAGE_SIZE));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot, { feature: "ledgerAudit" });
        const rows = snapshot.docs.map(toEvent);
        if (docId) {
          setLive(sortEventsNewestFirst(rows));
        } else {
          // Events are never deleted, so a row leaving the window was pushed
          // out by a newer one; keep it if older pages are already showing.
          const pushed = pushedOutRows(liveRef.current, rows);
          if (pushed.length > 0 && olderLoadedRef.current) {
            setOlder((prev) => mergeEventPages(pushed, prev));
          }
          liveRef.current = rows;
          setLive(rows);
          if (!olderLoadedRef.current) {
            cursorRef.current = snapshot.docs.at(-1) ?? null;
            setHasMore(pageMayHaveMore(rows.length));
          }
        }
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.ledgerEvents",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load the audit trail."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, docId, attempt, setError]);

  const loadMore = useCallback(async () => {
    const db = getFirestoreDb();
    const cursor = cursorRef.current;
    if (!uid || !db || docId || !cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "ledgerEvents"),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(LEDGER_EVENTS_PAGE_SIZE)
        )
      );
      logDirectRead(
        `users/${uid}/ledgerEvents`,
        snap.docs.length,
        snap.metadata.fromCache ? "cache" : "server",
        { feature: "ledgerAudit", queryShape: "older page" }
      );
      olderLoadedRef.current = true;
      cursorRef.current = snap.docs.at(-1) ?? cursor;
      setOlder((prev) => mergeEventPages(prev, snap.docs.map(toEvent)));
      setHasMore(pageMayHaveMore(snap.docs.length));
    } catch (failure) {
      logError("ledgerEvents.loadMore", failure);
      toast.error(friendlyErrorMessage(failure, "Couldn't load older audit entries."));
    } finally {
      setLoadingMore(false);
    }
  }, [uid, docId, loadingMore, hasMore]);

  const events = useMemo(() => mergeEventPages(live, older), [live, older]);

  return { events, loading, error, retry, hasMore, loadingMore, loadMore };
}
