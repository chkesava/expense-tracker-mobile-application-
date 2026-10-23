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
import { useExpenses } from "@/hooks/useExpenses";
import {
  auditCursorBelow,
  readAuditPage,
  readModelModeFor,
  shadowCompareAudit,
} from "@/lib/readModel/analyticsReadPath";
import type { AuditCursor } from "@/lib/readModel/analyticsSources";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { LedgerEvent } from "@/shared/types/ledgerEvent";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";
import { timestampMillis } from "@/shared/utils/readModel/mapping";
import {
  auditStrategy,
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
 *
 * SPENDLY-513, under `system_settings/global.readModel.audit`:
 * - `firestore` (default): exactly the above.
 * - `shadow`: the above; with `docId`, the row's events are also compared
 *   with the read model in the background.
 * - `supabase`: with `docId`, **no listener**: the row's events page from the
 *   read model (newest first). Without `docId`, the newest window stays a
 *   realtime listener and older pages come from the read model. A failure
 *   falls back to the Firestore path above for the session.
 */
export function useLedgerEvents(options?: {
  enabled?: boolean;
  docId?: string;
}) {
  const enabled = options?.enabled !== false;
  const docId = options?.docId;
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { readModelSession } = useExpenses();
  const { settings } = useSystemSettings();
  const configured = configuredReadModelMode(settings.readModel, "audit");
  // `firestore` is known at once (no delay, no connection); other modes are
  // resolved (online, duress, a read model, no earlier fallback).
  const [resolved, setResolved] = useState<{ configured: string; mode: "firestore" | "shadow" | "supabase" } | null>(null);
  const mode = configured === "firestore" ? "firestore" : resolved?.configured === configured ? resolved.mode : null;

  const [live, setLive] = useState<LedgerEvent[]>([]);
  const [older, setOlder] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();

  const liveRef = useRef<LedgerEvent[]>([]);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const readModelCursorRef = useRef<AuditCursor>(null);
  const olderLoadedRef = useRef(false);

  useEffect(() => {
    const db = getFirestoreDb();
    if (configured === "firestore" || !user || !db || !enabled) return;
    let cancelled = false;
    readModelModeFor("audit", { db, user, conditions: readModelSession.conditions() })
      .then((m) => {
        if (!cancelled) setResolved({ configured, mode: m });
      })
      .catch(() => {
        if (!cancelled) setResolved({ configured, mode: "firestore" });
      });
    return () => {
      cancelled = true;
    };
  }, [configured, user, enabled, readModelSession, isDuress, attempt]);

  const strategy = auditStrategy(mode, docId);
  // supabase, one row: pages from the read model, no listener.
  const pagedFromReadModel = strategy === "readModelPages";

  useEffect(() => {
    const db = getFirestoreDb();
    liveRef.current = [];
    cursorRef.current = null;
    readModelCursorRef.current = null;
    olderLoadedRef.current = false;
    setLive([]);
    setOlder([]);
    setHasMore(false);
    if (!uid || !enabled || !db) {
      setLoading(false);
      return;
    }
    if (strategy === "pending") {
      setLoading(true);
      return;
    }
    if (pagedFromReadModel && user) {
      let cancelled = false;
      setLoading(true);
      readAuditPage<LedgerEvent>({
        db,
        user,
        conditions: readModelSession.conditions(),
        cursor: null,
        targetDocId: docId,
        pageSize: LEDGER_EVENTS_PAGE_SIZE,
      })
        .catch(() => null)
        .then((page) => {
          if (cancelled) return;
          if (!page) {
            // Fell back: the Firestore listener takes over for this session.
            setResolved({ configured, mode: "firestore" });
            return;
          }
          readModelCursorRef.current = page.next;
          setLive(page.items);
          setHasMore(!page.exhausted);
          setError(null);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
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
          const sorted = sortEventsNewestFirst(rows);
          setLive(sorted);
          if (mode === "shadow" && user) {
            void shadowCompareAudit({ db, user, conditions: readModelSession.conditions(), docId, firestoreEvents: sorted });
          }
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
    // `user` and `configured` only matter through `mode`, which is listed.
  }, [uid, enabled, docId, attempt, setError, mode, strategy, pagedFromReadModel, readModelSession]);

  /** supabase: the next read-model page; false when the Firestore path should run instead. */
  const loadMoreFromReadModel = useCallback(async (): Promise<boolean> => {
    const db = getFirestoreDb();
    if (mode !== "supabase" || !user || !db) return false;
    let cursor = readModelCursorRef.current;
    if (!cursor && !docId) {
      // Start just below the realtime window; overlap is dropped by id.
      const oldest = liveRef.current.at(-1);
      const ms = oldest ? timestampMillis(oldest.createdAt) : null;
      if (ms === null) return false;
      cursor = auditCursorBelow(ms);
    }
    const page = await readAuditPage<LedgerEvent>({
      db,
      user,
      conditions: readModelSession.conditions(),
      cursor,
      targetDocId: docId,
      pageSize: LEDGER_EVENTS_PAGE_SIZE,
    });
    if (!page) return false;
    olderLoadedRef.current = true;
    readModelCursorRef.current = page.next;
    setOlder((prev) => mergeEventPages(prev, page.items));
    setHasMore(!page.exhausted);
    return true;
  }, [mode, user, docId, readModelSession]);

  const loadMore = useCallback(async () => {
    const db = getFirestoreDb();
    if (!uid || !db || loadingMore || !hasMore) return;
    if (mode === "supabase") {
      setLoadingMore(true);
      let served = false;
      try {
        served = await loadMoreFromReadModel();
      } catch (failure) {
        logError("ledgerEvents.loadMore", failure);
      } finally {
        setLoadingMore(false);
      }
      if (served) return;
      if (docId) {
        // One row's events came from the read model: re-subscribe on Firestore.
        setResolved({ configured, mode: "firestore" });
        return;
      }
    }
    const cursor = cursorRef.current;
    if (docId || !cursor) return;
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
  }, [uid, docId, loadingMore, hasMore, mode, configured, loadMoreFromReadModel]);

  const events = useMemo(() => mergeEventPages(live, older), [live, older]);

  return { events, loading, error, retry, hasMore, loadingMore, loadMore };
}
