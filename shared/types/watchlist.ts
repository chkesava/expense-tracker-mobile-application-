/**
 * Investment watchlists (SPENDLY-624). A watchlist is a set of symbols the
 * user follows; it is never a holding and never touches the portfolio, cash
 * or the ledger.
 *
 * Firestore layout (rules in firestore.rules, `watchlistWellFormed` and
 * `watchlistItemWellFormed`):
 *   users/{uid}/watchlists/{listId}
 *   users/{uid}/watchlists/{listId}/items/{yahooSymbol}
 * The item id IS the normalized Yahoo symbol, so a list can never hold the
 * same symbol twice. Not synced to the read model (READ_MODEL_RULES R2.1).
 */

import type { Exchange, InstrumentType } from "../features/portfolio/types";

export const DEFAULT_WATCHLIST_ID = "default";
export const DEFAULT_WATCHLIST_NAME = "My watchlist";

export const WATCHLIST_LIMITS = {
  /** Lists per user (client-enforced; rules can't count documents). */
  lists: 20,
  /** Items per list (client-enforced). */
  items: 50,
  /** List name length. */
  name: 40,
  /** Company/display name length on an item. */
  itemName: 120,
  /** Yahoo symbol length (matches the market functions' symbol pattern). */
  symbol: 25,
  /** `order` must stay strictly inside ±ORDER_BOUND. */
  orderBound: 1_000_000_000_000,
} as const;

export const WATCHLIST_EXCHANGES: readonly Exchange[] = ["NSE", "BSE", "US"];
export const WATCHLIST_INSTRUMENT_TYPES: readonly InstrumentType[] = ["stock", "etf", "mutual_fund", "gold", "crypto"];

/** A watchlist as the app uses it. Timestamps are epoch ms (null until the server stamps them). */
export interface Watchlist {
  id: string;
  name: string;
  isDefault: boolean;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  /** Set once the legacy single watchlist was copied into the default list. */
  importedLegacyAtMs: number | null;
}

/** One followed symbol. `id === yahooSymbol`. */
export interface WatchlistEntry {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  /** Fractional rank; lower comes first. */
  order: number;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}
