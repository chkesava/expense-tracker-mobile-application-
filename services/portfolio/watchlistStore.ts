/**
 * Investment watchlists: every write (SPENDLY-624, story SPENDLY-655).
 *
 * - Writes go through `commitMutations` (the offline outbox, then the
 *   read-model notify), with server timestamps the rules require
 *   (firestore.rules `watchlistWellFormed` / `watchlistItemWellFormed`).
 * - Item ids are the normalized Yahoo symbol, so a list can't hold a symbol
 *   twice; adding one already there is a no-op.
 * - "Create if missing" writes (the default list, the legacy copy, an add) are
 *   whole-document sets the rules accept again, so two devices or an offline
 *   replay don't collide. Edits (rename, move) are field updates.
 * - A watchlist is not a holding: nothing here reads or writes holdings,
 *   cash, portfolio transactions, accounts or the ledger.
 */

import { collection, doc, getDocs, serverTimestamp } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { getFirestoreDb } from "@/lib/firebase";
import type { InstrumentType } from "@/shared/features/portfolio/types";
import type { MutationOp } from "@/shared/types/mutations";
import { DEFAULT_WATCHLIST_ID, DEFAULT_WATCHLIST_NAME, type Watchlist, type WatchlistEntry } from "@/shared/types/watchlist";
import {
  appendOrder,
  canAddToWatchlist,
  canCreateWatchlist,
  checkWatchlistName,
  cleanItemName,
  displaySymbol,
  exchangeFor,
  normalizeWatchSymbol,
  planLegacyCopy,
  planMove,
  watchlistDoc,
  watchlistItemDoc,
  type LegacyWatchlistItem,
} from "@/shared/utils/watchlists";

const LISTS = "watchlists";
const ITEMS = "items";
const LEGACY = "watchlist";

export type StoreResult<T extends object = object> =
  | ({ ok: true; outcome: WriteOutcome } & T)
  | { ok: false; message: string };

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");
  return db;
}

const listRef = (uid: string, listId: string) => doc(requireDb(), "users", uid, LISTS, listId);
const itemRef = (uid: string, listId: string, itemId: string) => doc(requireDb(), "users", uid, LISTS, listId, ITEMS, itemId);

/** A new list id the rules accept: `wl_<time>_<random>`. */
export function newWatchlistId(nowMs: number = Date.now()): string {
  return `wl_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The old single watchlist (users/{uid}/watchlist), read once for the copy. */
export async function readLegacyWatchlist(uid: string): Promise<LegacyWatchlistItem[]> {
  if (!uid.trim()) return [];
  const snapshot = await getDocs(collection(requireDb(), "users", uid, LEGACY));
  return snapshot.docs.map((d) => d.data() as LegacyWatchlistItem);
}

/**
 * First run: create the default list and copy the old single watchlist into
 * it, in one batch. Old documents are never changed. Call it only when the
 * user's lists have loaded from the server and there is no default list.
 * Safe to run twice (same documents, and the rules accept the repeat).
 */
export async function initializeWatchlists(
  uid: string,
  legacy: readonly LegacyWatchlistItem[]
): Promise<StoreResult<{ copied: number; skipped: number }>> {
  const plan = planLegacyCopy(legacy);
  const ts = serverTimestamp();
  const ops: MutationOp[] = [
    {
      op: "set",
      ref: listRef(uid, DEFAULT_WATCHLIST_ID),
      data: watchlistDoc(DEFAULT_WATCHLIST_ID, DEFAULT_WATCHLIST_NAME, ts, legacy.length > 0 ? { importedLegacyAt: ts } : {}),
    },
    ...plan.items.map(
      (item): MutationOp => ({ op: "set", ref: itemRef(uid, DEFAULT_WATCHLIST_ID, item.yahooSymbol), data: watchlistItemDoc(item, ts) })
    ),
  ];
  const outcome = await commitMutations(uid, ops, { label: "watchlist setup" });
  return { ok: true, outcome, copied: plan.items.length, skipped: plan.skipped };
}

export async function createWatchlist(
  uid: string,
  name: string,
  existing: readonly Watchlist[],
  nowMs: number = Date.now()
): Promise<StoreResult<{ id: string }>> {
  if (!canCreateWatchlist(existing)) return { ok: false, message: "You can keep up to 20 watchlists. Delete one to make another." };
  const checked = checkWatchlistName(name, existing);
  if (!checked.ok) return checked;
  const id = newWatchlistId(nowMs);
  const outcome = await commitMutations(
    uid,
    [{ op: "set", ref: listRef(uid, id), data: watchlistDoc(id, checked.name, serverTimestamp()) }],
    { label: "watchlist" }
  );
  return { ok: true, outcome, id };
}

export async function renameWatchlist(uid: string, listId: string, name: string, existing: readonly Watchlist[]): Promise<StoreResult> {
  if (!existing.some((l) => l.id === listId)) return { ok: false, message: "That watchlist no longer exists." };
  const checked = checkWatchlistName(name, existing, listId);
  if (!checked.ok) return checked;
  const outcome = await commitMutations(
    uid,
    [{ op: "update", ref: listRef(uid, listId), data: { name: checked.name, updatedAt: serverTimestamp() } }],
    { label: "watchlist rename" }
  );
  return { ok: true, outcome };
}

/**
 * Deletes a list and every item in it, in one batch (a list holds at most 50
 * items). The default list can't be deleted. The items are read first, so a
 * list that isn't open on screen is still emptied.
 */
export async function deleteWatchlist(uid: string, listId: string): Promise<StoreResult<{ removed: number }>> {
  if (listId === DEFAULT_WATCHLIST_ID) return { ok: false, message: "Your main watchlist can't be deleted. You can rename it." };
  const items = await getDocs(collection(requireDb(), "users", uid, LISTS, listId, ITEMS));
  const ops: MutationOp[] = [
    ...items.docs.map((d): MutationOp => ({ op: "delete", ref: itemRef(uid, listId, d.id) })),
    { op: "delete", ref: listRef(uid, listId) },
  ];
  const outcome = await commitMutations(uid, ops, { label: "watchlist delete" });
  return { ok: true, outcome, removed: items.docs.length };
}

export type AddInput = { symbol: string; name?: string | null; instrumentType?: InstrumentType };

/**
 * Adds a stock to a list. The symbol is normalized ("tcs" → "TCS.NS"); one
 * already in the list is reported as `exists` and nothing is written.
 * `ensureList` creates the list in the same batch (the default list before
 * it exists).
 */
export async function addToWatchlist(
  uid: string,
  listId: string,
  input: AddInput,
  entries: readonly WatchlistEntry[],
  opts: { ensureList?: { name: string } } = {}
): Promise<StoreResult<{ id: string; status: "added" }> | { ok: true; status: "exists"; id: string }> {
  const yahooSymbol = normalizeWatchSymbol(input.symbol);
  if (!yahooSymbol) return { ok: false, message: "That doesn't look like a stock symbol. Try one like TCS or INFY." };
  if (entries.some((e) => e.yahooSymbol === yahooSymbol)) return { ok: true, status: "exists", id: yahooSymbol };
  if (!canAddToWatchlist(entries)) return { ok: false, message: "A watchlist can hold up to 50 stocks. Remove one or use another list." };

  const ts = serverTimestamp();
  const ops: MutationOp[] = [];
  if (opts.ensureList) ops.push({ op: "set", ref: listRef(uid, listId), data: watchlistDoc(listId, opts.ensureList.name, ts) });
  ops.push({
    op: "set",
    ref: itemRef(uid, listId, yahooSymbol),
    data: watchlistItemDoc(
      {
        yahooSymbol,
        name: cleanItemName(input.name, displaySymbol(yahooSymbol)),
        exchange: exchangeFor(yahooSymbol),
        instrumentType: input.instrumentType ?? "stock",
        order: appendOrder(entries),
      },
      ts
    ),
  });
  const outcome = await commitMutations(uid, ops, { label: "watchlist add" });
  return { ok: true, outcome, id: yahooSymbol, status: "added" };
}

export async function removeFromWatchlist(uid: string, listId: string, yahooSymbol: string): Promise<StoreResult> {
  const outcome = await commitMutations(uid, [{ op: "delete", ref: itemRef(uid, listId, yahooSymbol) }], { label: "watchlist remove" });
  return { ok: true, outcome };
}

/** Moves one item up or down a place: usually one write, a renumber batch when ranks collapse. */
export async function moveWatchlistItem(
  uid: string,
  listId: string,
  entries: readonly WatchlistEntry[],
  id: string,
  direction: "up" | "down"
): Promise<StoreResult<{ moved: boolean }>> {
  const plan = planMove(entries, id, direction);
  if (plan.kind === "none") return { ok: true, outcome: "acked", moved: false };
  const ts = serverTimestamp();
  const changes = plan.kind === "single" ? [{ id: plan.id, order: plan.order }] : plan.orders;
  const outcome = await commitMutations(
    uid,
    changes.map((c): MutationOp => ({ op: "update", ref: itemRef(uid, listId, c.id), data: { order: c.order, updatedAt: ts } })),
    { label: "watchlist reorder" }
  );
  return { ok: true, outcome, moved: true };
}
