import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { LISTEN_WITH_SYNC_STATE, onlyMetadataChanged } from "@/lib/firestoreSyncState";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import {
  addToWatchlist,
  createWatchlist,
  deleteWatchlist,
  initializeWatchlists,
  moveWatchlistItem,
  readLegacyWatchlist,
  removeFromWatchlist,
  renameWatchlist,
  type AddInput,
  type StoreResult,
} from "@/services/portfolio/watchlistStore";
import { DEFAULT_WATCHLIST_NAME, type Watchlist, type WatchlistEntry } from "@/shared/types/watchlist";
import {
  pickOpenWatchlistId,
  shouldInitializeWatchlists,
  sortEntries,
  sortWatchlists,
  watchlistEntryFromDoc,
  watchlistFromDoc,
} from "@/shared/utils/watchlists";

type Failure = { ok: false; message: string };

/** Runs a store call; a thrown error becomes a friendly `{ ok: false }` (and is logged). */
async function attempt<R>(scope: string, run: () => Promise<R>, fallback: string): Promise<R | Failure> {
  try {
    return await run();
  } catch (error) {
    logError(scope, error);
    return { ok: false, message: friendlyErrorMessage(error, fallback) };
  }
}

/**
 * The user's watchlists (SPENDLY-624, story SPENDLY-657). Mount it only where
 * a watchlist is on screen (`enabled`): it holds two listeners, one on the
 * lists and one on the open list's items (SPENDLY-406).
 *
 * The first time lists load *from the server* with no default list, it
 * creates the default list and copies the old single watchlist into it
 * (`initializeWatchlists`), once per session. Duress-aware uid via `useAuth`.
 *
 * Writes go through `services/portfolio/watchlistStore` (the outbox). Nothing
 * here touches holdings, cash or the ledger.
 */
export function useWatchlists(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [lists, setLists] = useState<Watchlist[]>([]);
  const [listsFromCache, setListsFromCache] = useState(true);
  const [listsLoading, setListsLoading] = useState(true);
  const lists$ = useLoadFailure();

  const [requestedId, setRequestedId] = useState<string | null>(null);
  const openListId = pickOpenWatchlistId(lists, requestedId);
  const openList = lists.find((l) => l.id === openListId) ?? null;

  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const items$ = useLoadFailure();

  const [setupError, setSetupError] = useState<string | null>(null);
  const setupTried = useRef(false);

  // Lists listener, with sync state so setup only runs on server data.
  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setLists([]);
      setListsFromCache(true);
      setListsLoading(false);
      return;
    }
    setListsLoading(true);
    const path = `users/${uid}/watchlists`;
    let received = false;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "watchlists"),
      LISTEN_WITH_SYNC_STATE,
      (snap) => {
        setListsFromCache(snap.metadata.fromCache);
        const first = !received;
        received = true;
        if (onlyMetadataChanged(snap, first)) return;
        setLists(sortWatchlists(snap.docs.map((d) => watchlistFromDoc(d.id, d.data())).filter((l): l is Watchlist => !!l)));
        lists$.setError(null);
        setListsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.watchlists",
        (failure) => {
          lists$.setError(failure);
          setListsLoading(false);
        },
        "Couldn't load your watchlists."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, lists$.attempt]);

  // Items of the open list only.
  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setEntries([]);
      setEntriesLoading(false);
      return;
    }
    setEntries([]);
    setEntriesLoading(true);
    const path = `users/${uid}/watchlists/${openListId}/items`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "watchlists", openListId, "items"),
      (snap) => {
        setEntries(sortEntries(snap.docs.map((d) => watchlistEntryFromDoc(d.id, d.data())).filter((e): e is WatchlistEntry => !!e)));
        items$.setError(null);
        setEntriesLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.watchlistItems",
        (failure) => {
          items$.setError(failure);
          setEntriesLoading(false);
        },
        "Couldn't load this watchlist."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, openListId, items$.attempt]);

  // First-time setup: default list + the old watchlist copied in.
  useEffect(() => {
    if (!uid || !enabled || listsLoading || lists$.error) return;
    if (!shouldInitializeWatchlists({ fromCache: listsFromCache, lists, tried: setupTried.current })) return;
    setupTried.current = true;
    void (async () => {
      const result = await attempt(
        "watchlists.initialize",
        async () => initializeWatchlists(uid, await readLegacyWatchlist(uid)),
        "Couldn't set up your watchlist."
      );
      setSetupError(result.ok ? null : result.message);
    })();
  }, [uid, enabled, listsLoading, listsFromCache, lists, lists$.error]);

  // A different user (or duress switch) starts fresh.
  useEffect(() => {
    setupTried.current = false;
    setSetupError(null);
    setRequestedId(null);
  }, [uid]);

  const retry = useCallback(() => {
    setupTried.current = false;
    setSetupError(null);
    lists$.retry();
    items$.retry();
  }, []);

  const noUser: Failure = { ok: false, message: "Sign in to use watchlists." };

  const add = useCallback(
    (input: AddInput): Promise<Awaited<ReturnType<typeof addToWatchlist>> | Failure> => {
      if (!uid) return Promise.resolve(noUser);
      // Before setup finishes the default list may not exist yet: create it with the item.
      const ensureList = openList ? undefined : { name: DEFAULT_WATCHLIST_NAME };
      return attempt("watchlists.add", () => addToWatchlist(uid, openListId, input, entries, { ensureList }), "Couldn't add to your watchlist.");
    },
    [uid, openListId, openList, entries]
  );

  const remove = useCallback(
    (yahooSymbol: string): Promise<StoreResult | Failure> =>
      uid ? attempt("watchlists.remove", () => removeFromWatchlist(uid, openListId, yahooSymbol), "Couldn't remove it.") : Promise.resolve(noUser),
    [uid, openListId]
  );

  const move = useCallback(
    (yahooSymbol: string, direction: "up" | "down") =>
      uid
        ? attempt("watchlists.move", () => moveWatchlistItem(uid, openListId, entries, yahooSymbol, direction), "Couldn't reorder.")
        : Promise.resolve(noUser),
    [uid, openListId, entries]
  );

  const create = useCallback(
    async (name: string) => {
      if (!uid) return noUser;
      const result = await attempt("watchlists.create", () => createWatchlist(uid, name, lists), "Couldn't create the watchlist.");
      if (result.ok) setRequestedId(result.id);
      return result;
    },
    [uid, lists]
  );

  const rename = useCallback(
    (listId: string, name: string) =>
      uid ? attempt("watchlists.rename", () => renameWatchlist(uid, listId, name, lists), "Couldn't rename the watchlist.") : Promise.resolve(noUser),
    [uid, lists]
  );

  const removeList = useCallback(
    (listId: string) =>
      uid ? attempt("watchlists.delete", () => deleteWatchlist(uid, listId), "Couldn't delete the watchlist.") : Promise.resolve(noUser),
    [uid]
  );

  const error = lists$.error ?? items$.error;
  return useMemo(
    () => ({
      uid,
      lists,
      openListId,
      openList,
      selectList: setRequestedId,
      entries,
      /** True until both the lists and the open list's items have loaded once. */
      loading: listsLoading || entriesLoading,
      /** Lists not yet confirmed by the server (offline or just opened). */
      listsFromCache,
      error,
      setupError,
      retry,
      add,
      remove,
      move,
      create,
      rename,
      removeList,
    }),
    [uid, lists, openListId, openList, entries, listsLoading, entriesLoading, listsFromCache, error, setupError, retry, add, remove, move, create, rename, removeList]
  );
}

export type WatchlistsState = ReturnType<typeof useWatchlists>;
