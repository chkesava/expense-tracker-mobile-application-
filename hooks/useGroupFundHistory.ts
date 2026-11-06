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
} from "@/lib/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { isLocalTestMode } from "@/lib/env";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logDirectRead, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { groupFundCursorBelow, type GroupFundEventsCursor } from "@/lib/readModel/groupFundSources";
import { readGroupFundHistoryPage, shadowCompareGroupFundHistoryPage } from "@/lib/readModel/groupFundsReadPath";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { GroupFundEvent } from "@/shared/types/groupFund";
import { GROUP_FUND_HISTORY_PAGE_SIZE, groupFundEventFromDoc, sortGroupFundEvents } from "@/shared/utils/groupFundDocs";
import { mergeEventPages, pageMayHaveMore, pushedOutRows } from "@/shared/utils/ledgerEventPages";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

function historyConstraints(fundId: string): QueryConstraint[] {
  return [where("fundId", "==", fundId), orderBy("createdAtMs", "desc")];
}

function toEvents(docs: QueryDocumentSnapshot[]): GroupFundEvent[] {
  return docs
    .map((d) => groupFundEventFromDoc(d.id, d.data() as Record<string, unknown>))
    .filter((e): e is GroupFundEvent => !!e);
}

/**
 * One Group Fund's history (SPENDLY-685), newest first. Mount only where the
 * history renders (SPENDLY-406): the fund list never reads events.
 *
 * Bounded: a realtime listener on the newest `GROUP_FUND_HISTORY_PAGE_SIZE`
 * events (this device's own writes, pending ones included, appear at once —
 * the "just wrote" window stays on Firestore, READ_MODEL_RULES R4.3), and
 * `loadMore` pages older events by cursor. Needs the
 * `groupFundEvents (fundId, createdAtMs desc)` index.
 *
 * With `system_settings/global.readModel.groupFundHistory = "supabase"`, older pages
 * come from the read model (below the realtime window), falling back to the
 * Firestore cursor on any failure. The default is `firestore`.
 */
export function useGroupFundHistory(fundId: string | undefined, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && Boolean(fundId);
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const [live, setLive] = useState<GroupFundEvent[]>([]);
  const [older, setOlder] = useState<GroupFundEvent[]>([]);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { error, setError, retry, attempt } = useLoadFailure();
  const liveRef = useRef<GroupFundEvent[]>([]);
  const cursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const readModelCursorRef = useRef<GroupFundEventsCursor | undefined>(undefined);
  const olderLoadedRef = useRef(false);
  // Bumped on every reset (fund change, retry); an older-page read started
  // before it is discarded instead of moving the new cursor.
  const generationRef = useRef(0);

  useEffect(() => {
    const db = getFirestoreDb();
    generationRef.current += 1;
    setLoadingMore(false);
    liveRef.current = [];
    cursorRef.current = null;
    readModelCursorRef.current = undefined;
    olderLoadedRef.current = false;
    setLive([]);
    setOlder([]);
    setHasMore(false);
    if (!uid || !db || !enabled || !fundId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/groupFundEvents?fundId=${fundId}&limit=${GROUP_FUND_HISTORY_PAGE_SIZE}`;
    const q = query(
      collection(db, "users", uid, "groupFundEvents"),
      ...historyConstraints(fundId),
      limit(GROUP_FUND_HISTORY_PAGE_SIZE)
    );
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        logQuerySnapshot(path, snapshot, { feature: "groupFunds", queryShape: "fund history window" });
        const rows = toEvents(snapshot.docs);
        // Events are never deleted: a row leaving the window was pushed out by a newer one.
        const pushed = pushedOutRows(liveRef.current, rows);
        if (pushed.length > 0 && olderLoadedRef.current) setOlder((prev) => mergeEventPages(pushed, prev));
        liveRef.current = rows;
        setLive(rows);
        setPendingIds(new Set(snapshot.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.id)));
        if (!olderLoadedRef.current) {
          cursorRef.current = snapshot.docs.at(-1) ?? null;
          setHasMore(pageMayHaveMore(snapshot.docs.length, GROUP_FUND_HISTORY_PAGE_SIZE));
        }
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.groupFundEvents",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this fund's history."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, fundId, enabled, attempt, setError]);

  /** `supabase` mode: one older page from the read model. False means "use the Firestore cursor". */
  const loadMoreFromReadModel = useCallback(async (): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!db || !user || !fundId) return false;
    const generation = generationRef.current;
    let cursor = readModelCursorRef.current;
    if (cursor === undefined) {
      const oldest = [...liveRef.current].sort((a, b) => a.createdAtMs - b.createdAtMs)[0];
      if (!oldest) return false;
      cursor = groupFundCursorBelow(oldest.createdAtMs);
    }
    const page = await readGroupFundHistoryPage({
      db,
      user,
      fundId,
      cursor,
      pageSize: GROUP_FUND_HISTORY_PAGE_SIZE,
      conditions: { setting: settings.readModel, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() },
    });
    if (!page) return false;
    if (generation !== generationRef.current) return true; // reset meanwhile: drop it
    olderLoadedRef.current = true;
    readModelCursorRef.current = page.next;
    setOlder((prev) => mergeEventPages(prev, page.items));
    setHasMore(!page.exhausted);
    return true;
  }, [user, fundId, settings.readModel, isOnline, isDuress]);

  const loadMore = useCallback(async () => {
    const db = getFirestoreDb();
    const cursor = cursorRef.current;
    if (!uid || !db || !fundId || loadingMore || !hasMore) return;
    const generation = generationRef.current;
    if (configuredReadModelMode(settings.readModel, "groupFundHistory") === "supabase") {
      setLoadingMore(true);
      let served = false;
      try {
        served = await loadMoreFromReadModel();
      } catch (failure) {
        logError("groupFundHistory.loadMore.readModel", failure);
      } finally {
        if (generation === generationRef.current) setLoadingMore(false);
      }
      if (served) return;
    }
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "groupFundEvents"),
          ...historyConstraints(fundId),
          startAfter(cursor),
          limit(GROUP_FUND_HISTORY_PAGE_SIZE)
        )
      );
      logDirectRead(`users/${uid}/groupFundEvents`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
        feature: "groupFunds",
        queryShape: "fund history older page",
      });
      if (generation !== generationRef.current) return; // reset meanwhile: drop it
      const page = toEvents(snap.docs);
      // Shadow: compare this Firestore page with the copy over the same span.
      const above = (cursor.data() as { createdAtMs?: number }).createdAtMs;
      if (user && typeof above === "number" && configuredReadModelMode(settings.readModel, "groupFundHistory") === "shadow") {
        void shadowCompareGroupFundHistoryPage({
          db,
          user,
          fundId,
          aboveMs: above,
          firestoreItems: page,
          conditions: { setting: settings.readModel, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() },
        }).catch((failure) => logError("groupFundHistory.shadow", failure));
      }
      olderLoadedRef.current = true;
      cursorRef.current = snap.docs.at(-1) ?? cursor;
      setOlder((prev) => mergeEventPages(prev, page));
      setHasMore(pageMayHaveMore(snap.docs.length, GROUP_FUND_HISTORY_PAGE_SIZE));
    } catch (failure) {
      logError("groupFundHistory.loadMore", failure);
      toast.error(friendlyErrorMessage(failure, "Couldn't load older entries."));
    } finally {
      if (generation === generationRef.current) setLoadingMore(false);
    }
  }, [uid, user, fundId, loadingMore, hasMore, settings.readModel, isOnline, isDuress, loadMoreFromReadModel]);

  const events = sortGroupFundEvents(mergeEventPages(live, older));
  return { events, pendingIds, loading, error, retry, hasMore, loadingMore, loadMore };
}
