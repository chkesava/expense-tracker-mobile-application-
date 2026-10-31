/**
 * Pure watchlist rules (SPENDLY-624, story SPENDLY-654): symbol
 * normalization, document shapes, ordering, limits and the legacy copy.
 * No Firebase or React Native imports — the store (SPENDLY-655) passes the
 * server-timestamp sentinel in, and the rules contract test reads the shapes.
 */

import type { Exchange, InstrumentType } from "../features/portfolio/types";
import {
  DEFAULT_WATCHLIST_ID,
  WATCHLIST_EXCHANGES,
  WATCHLIST_INSTRUMENT_TYPES,
  WATCHLIST_LIMITS,
  type Watchlist,
  type WatchlistEntry,
} from "../types/watchlist";
import { normalizeStockSymbol } from "./marketQuotes";

/** Same pattern the market functions accept (stockHistory SYMBOL_PATTERN), and the rules check. */
export const WATCHLIST_SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.&_^-]{0,24}$/;
/** List ids: the fixed `default`, or generated ids of this shape. */
export const WATCHLIST_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The Yahoo symbol a user's input refers to, or null. "tcs" → "TCS.NS",
 * "infy.bo" → "INFY.BO", "^nsei" → "^NSEI". This is also the item's id.
 */
export function normalizeWatchSymbol(raw: string | null | undefined): string | null {
  const symbol = normalizeStockSymbol(raw);
  return symbol && WATCHLIST_SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

/** "TCS.NS" → "TCS" for display; indices keep their caret. */
export function displaySymbol(yahooSymbol: string): string {
  return yahooSymbol.replace(/\.(NS|BO)$/, "");
}

/** The exchange a Yahoo symbol trades on, by its suffix. */
export function exchangeFor(yahooSymbol: string): Exchange {
  if (yahooSymbol.endsWith(".BO")) return "BSE";
  if (yahooSymbol.endsWith(".NS") || yahooSymbol.startsWith("^")) return "NSE";
  return "US";
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/** Trimmed list name, unique among the user's lists ignoring case. */
export function checkWatchlistName(raw: string, existing: readonly Pick<Watchlist, "id" | "name">[], exceptId?: string): NameCheck {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, message: "Give the watchlist a name." };
  if (name.length > WATCHLIST_LIMITS.name) return { ok: false, message: `Keep the name to ${WATCHLIST_LIMITS.name} characters.` };
  if (existing.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: "You already have a watchlist with that name." };
  }
  return { ok: true, name };
}

export function canCreateWatchlist(existing: readonly unknown[]): boolean {
  return existing.length < WATCHLIST_LIMITS.lists;
}

export function canAddToWatchlist(items: readonly unknown[]): boolean {
  return items.length < WATCHLIST_LIMITS.items;
}

/** A display name that fits the rules: trimmed, non-empty, capped. */
export function cleanItemName(raw: string | null | undefined, fallback: string): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim() || fallback;
  return name.slice(0, WATCHLIST_LIMITS.itemName);
}

// --- Document shapes ---------------------------------------------------------
// `ts` is the server-timestamp sentinel the store passes in; on update the
// stored `createdAt` is passed back unchanged (the rules pin it).

export function watchlistDoc(
  listId: string,
  name: string,
  ts: unknown,
  opts: { createdAt?: unknown; importedLegacyAt?: unknown } = {}
): Record<string, unknown> {
  return {
    name,
    isDefault: listId === DEFAULT_WATCHLIST_ID,
    createdAt: opts.createdAt ?? ts,
    updatedAt: ts,
    ...(opts.importedLegacyAt !== undefined ? { importedLegacyAt: opts.importedLegacyAt } : {}),
  };
}

export function watchlistItemDoc(
  item: { yahooSymbol: string; name: string; exchange: Exchange; instrumentType: InstrumentType; order: number },
  ts: unknown,
  opts: { createdAt?: unknown } = {}
): Record<string, unknown> {
  return {
    symbol: displaySymbol(item.yahooSymbol),
    yahooSymbol: item.yahooSymbol,
    name: item.name,
    exchange: item.exchange,
    instrumentType: item.instrumentType,
    order: item.order,
    createdAt: opts.createdAt ?? ts,
    updatedAt: ts,
  };
}

// --- Ordering ----------------------------------------------------------------

/** Ranks are spaced by this much when appended or renumbered. */
export const ORDER_STEP = 1024;
/** Below this gap a midpoint loses precision; renumber instead. */
export const MIN_ORDER_GAP = 1e-6;

export function sortEntries<T extends Pick<WatchlistEntry, "order" | "yahooSymbol">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.order - b.order || (a.yahooSymbol < b.yahooSymbol ? -1 : a.yahooSymbol > b.yahooSymbol ? 1 : 0));
}

/** The rank for a new item at the end of the list. */
export function appendOrder(entries: readonly Pick<WatchlistEntry, "order">[]): number {
  if (entries.length === 0) return ORDER_STEP;
  return Math.max(...entries.map((e) => e.order)) + ORDER_STEP;
}

export type MovePlan =
  | { kind: "none" }
  /** Write one document: the moved item's new rank. */
  | { kind: "single"; id: string; order: number }
  /** Ranks collapsed: rewrite every item's rank in the new order. */
  | { kind: "renumber"; orders: { id: string; order: number }[] };

/**
 * Moving an item up or down one place. Normally one write (the midpoint
 * between its new neighbours); when the gap is too small to split, the whole
 * list is renumbered in one batch.
 */
export function planMove(entries: readonly Pick<WatchlistEntry, "id" | "order" | "yahooSymbol">[], id: string, direction: "up" | "down"): MovePlan {
  const sorted = sortEntries(entries);
  const from = sorted.findIndex((e) => e.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= sorted.length) return { kind: "none" };

  const without = sorted.filter((e) => e.id !== id);
  const before = without[to - 1];
  const after = without[to];
  let order: number;
  if (!before) order = after.order - ORDER_STEP;
  else if (!after) order = before.order + ORDER_STEP;
  else order = (before.order + after.order) / 2;

  const tooTight = (before && order - before.order < MIN_ORDER_GAP) || (after && after.order - order < MIN_ORDER_GAP);
  const outOfBounds = Math.abs(order) >= WATCHLIST_LIMITS.orderBound;
  if (tooTight || outOfBounds) {
    const reordered = [...without];
    reordered.splice(to, 0, sorted[from]);
    return { kind: "renumber", orders: reordered.map((e, i) => ({ id: e.id, order: (i + 1) * ORDER_STEP })) };
  }
  return { kind: "single", id, order };
}

// --- Reading Firestore data --------------------------------------------------

function ms(value: unknown): number | null {
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const n = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(n) ? n : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A list document as the app uses it, or null if it doesn't look like one. */
export function watchlistFromDoc(id: string, data: Record<string, unknown> | undefined): Watchlist | null {
  if (!data || typeof data.name !== "string" || typeof data.isDefault !== "boolean") return null;
  return {
    id,
    name: data.name,
    isDefault: data.isDefault,
    createdAtMs: ms(data.createdAt),
    updatedAtMs: ms(data.updatedAt),
    importedLegacyAtMs: ms(data.importedLegacyAt),
  };
}

/** An item document as the app uses it, or null if it doesn't look like one. */
export function watchlistEntryFromDoc(id: string, data: Record<string, unknown> | undefined): WatchlistEntry | null {
  if (!data || typeof data.yahooSymbol !== "string" || data.yahooSymbol !== id) return null;
  if (typeof data.order !== "number" || !Number.isFinite(data.order)) return null;
  const exchange = WATCHLIST_EXCHANGES.includes(data.exchange as Exchange) ? (data.exchange as Exchange) : exchangeFor(id);
  const instrumentType = WATCHLIST_INSTRUMENT_TYPES.includes(data.instrumentType as InstrumentType)
    ? (data.instrumentType as InstrumentType)
    : "stock";
  return {
    id,
    symbol: typeof data.symbol === "string" ? data.symbol : displaySymbol(id),
    yahooSymbol: id,
    name: typeof data.name === "string" && data.name ? data.name : displaySymbol(id),
    exchange,
    instrumentType,
    order: data.order,
    createdAtMs: ms(data.createdAt),
    updatedAtMs: ms(data.updatedAt),
  };
}

/** Lists in display order: the default list first, then by creation, then name. */
export function sortWatchlists(lists: readonly Watchlist[]): Watchlist[] {
  return [...lists].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    const ca = a.createdAtMs ?? Number.MAX_SAFE_INTEGER;
    const cb = b.createdAtMs ?? Number.MAX_SAFE_INTEGER;
    return ca - cb || a.name.localeCompare(b.name);
  });
}

// --- Legacy copy (users/{uid}/watchlist → default list) -----------------------

export type LegacyWatchlistItem = { symbol?: unknown; yahooSymbol?: unknown; name?: unknown; exchange?: unknown; instrumentType?: unknown };

export type LegacyCopyPlan = {
  /** Items for the default list, in their original order, de-duplicated. */
  items: { yahooSymbol: string; name: string; exchange: Exchange; instrumentType: InstrumentType; order: number }[];
  /** Legacy entries that couldn't be mapped to a Yahoo symbol (e.g. mutual funds). */
  skipped: number;
};

/**
 * What the one-time copy of the old single watchlist into the default list
 * writes. Old documents are never changed. Symbols are normalized; duplicates
 * collapse (the item id is the symbol), so running it twice writes the same
 * documents again. Capped at the per-list limit.
 */
export function planLegacyCopy(legacy: readonly LegacyWatchlistItem[]): LegacyCopyPlan {
  const items: LegacyCopyPlan["items"] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const entry of legacy) {
    const raw = typeof entry.yahooSymbol === "string" && entry.yahooSymbol ? entry.yahooSymbol : typeof entry.symbol === "string" ? entry.symbol : "";
    const yahooSymbol = normalizeWatchSymbol(raw);
    if (!yahooSymbol) {
      skipped += 1;
      continue;
    }
    if (seen.has(yahooSymbol)) continue;
    if (items.length >= WATCHLIST_LIMITS.items) {
      skipped += 1;
      continue;
    }
    seen.add(yahooSymbol);
    const instrumentType = WATCHLIST_INSTRUMENT_TYPES.includes(entry.instrumentType as InstrumentType)
      ? (entry.instrumentType as InstrumentType)
      : "stock";
    items.push({
      yahooSymbol,
      name: cleanItemName(typeof entry.name === "string" ? entry.name : "", displaySymbol(yahooSymbol)),
      exchange: exchangeFor(yahooSymbol),
      instrumentType,
      order: (items.length + 1) * ORDER_STEP,
    });
  }
  return { items, skipped };
}

/** True when a list id is acceptable to the rules. */
export function isValidWatchlistId(id: string): boolean {
  return WATCHLIST_ID_PATTERN.test(id);
}

export { DEFAULT_WATCHLIST_ID };
