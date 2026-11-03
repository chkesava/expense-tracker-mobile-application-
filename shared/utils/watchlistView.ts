/**
 * What the Watchlist tab shows, as plain data (SPENDLY-624, story SPENDLY-658).
 *
 * The components only draw this. Loading, errors, empty lists, quote states
 * and the add form's live feedback are decided here, so they are covered by
 * tests in a repo that doesn't render components under test.
 *
 * A failed or missing price never removes a row: the stock stays in the list
 * with "Price unavailable". Index levels are points, not money.
 */

import type { BatchQuoteDTO } from "../types/market";
import { WATCHLIST_LIMITS, type Watchlist, type WatchlistEntry } from "../types/watchlist";
import type { BannerView, Direction, Instrument, MoverView } from "./marketsView";
import { formatPoints, formatSignedPct, formatSignedPoints } from "./marketsView";
import { formatIstTime } from "./marketOverview";
import type { QuoteRow } from "./stockQuotes";
import { formatQuotePrice } from "./stockChartInspect";
import { canAddToWatchlist, canCreateWatchlist, displaySymbol, normalizeWatchSymbol } from "./watchlists";

export type WatchlistChip = { id: string; label: string; selected: boolean };

export type WatchlistRowView = {
  /** The Yahoo symbol, also the item id. */
  symbol: string;
  /** "TCS", "^NSEI" */
  ticker: string;
  name: string;
  /** "NSE", "BSE" or "Index". */
  listing: string;
  /** "₹2,502.60" (stocks) or "23,053.10" (index points); null with no price. */
  price: string | null;
  /** "+24.60 (+0.99%)"; null when there's no previous close. */
  move: string | null;
  direction: Direction;
  /** Shown under the figures: why there's no price, or that it's a saved one. */
  note: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  accessibilityLabel: string;
};

export type WatchlistEmpty = { title: string; description: string };

export type WatchlistView =
  /** First load, nothing to show yet. */
  | { kind: "loading" }
  /** The lists couldn't load and there's nothing to show. */
  | { kind: "error"; title: string; description: string }
  | {
      kind: "ready";
      chips: WatchlistChip[];
      open: { id: string; name: string; isDefault: boolean; canDelete: boolean; countLabel: string };
      canCreateList: boolean;
      /** At most one: a load or setup problem wins over a quote problem. */
      banner: BannerView | null;
      /** "Prices as of 15:31 IST" etc., or null when nothing is priced. */
      quotesLabel: string | null;
      rows: WatchlistRowView[];
      empty: WatchlistEmpty | null;
      /** Null when a stock can be added; otherwise why not. */
      addBlocked: string | null;
    };

export type WatchlistViewInput = {
  lists: readonly Watchlist[];
  openListId: string;
  entries: readonly WatchlistEntry[];
  loading: boolean;
  /** Message of the last lists/items load failure, or null. */
  loadError: string | null;
  setupError: string | null;
  quotes: {
    rows: readonly QuoteRow[];
    label: string | null;
    isOffline: boolean;
    /** Copy for the last failed quote load, or null. */
    errorMessage: string | null;
    /** A quote request is in flight. */
    fetching: boolean;
  };
  nowMs: number;
};

const MAX_ITEMS = WATCHLIST_LIMITS.items;

function directionOf(value: number | null): Direction {
  if (value == null) return "flat";
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
}

function listingOf(yahooSymbol: string): string {
  if (yahooSymbol.startsWith("^")) return "Index";
  return yahooSymbol.endsWith(".BO") ? "BSE" : "NSE";
}

function priceText(quote: BatchQuoteDTO): string {
  if (quote.isIndex || !quote.currency) return formatPoints(quote.price);
  return formatQuotePrice(quote.price, quote.currency);
}

function moveText(quote: BatchQuoteDTO): string | null {
  if (quote.change == null || quote.changePercent == null) return null;
  const pct = formatSignedPct(quote.changePercent);
  if (quote.isIndex || !quote.currency) return `${formatSignedPoints(quote.change)} (${pct})`;
  const dir = directionOf(quote.change);
  const abs = formatQuotePrice(Math.abs(quote.change), quote.currency);
  return `${dir === "up" ? "+" : dir === "down" ? "-" : ""}${abs} (${pct})`;
}

const SPOKEN: Record<Direction, string> = { up: "up", down: "down", flat: "unchanged" };

export function watchlistRowView(
  entry: Pick<WatchlistEntry, "yahooSymbol" | "name">,
  row: QuoteRow | undefined,
  index: number,
  count: number,
  ctx: { fetching: boolean; nowMs: number }
): WatchlistRowView {
  const quote = row?.quote ?? null;
  const ticker = displaySymbol(entry.yahooSymbol);
  const price = quote ? priceText(quote) : null;
  const move = quote ? moveText(quote) : null;
  const direction = directionOf(quote?.changePercent ?? null);

  let note: string | null = null;
  if (!quote) {
    note = row?.state === "unknown" ? "Not found on Yahoo Finance" : ctx.fetching ? "Loading price…" : "Price unavailable";
  } else if (row?.state === "saved" && row.savedAt) {
    note = `Saved ${formatIstTime(row.savedAt, ctx.nowMs)}`;
  }

  const spokenMove =
    quote && quote.changePercent != null
      ? direction === "flat"
        ? ", unchanged"
        : `, ${SPOKEN[direction]} ${Math.abs(quote.changePercent).toFixed(2)} percent`
      : "";
  const accessibilityLabel = `${entry.name}, ${ticker}, ${price ?? note ?? "no price"}${spokenMove}`;

  return {
    symbol: entry.yahooSymbol,
    ticker,
    name: entry.name,
    listing: listingOf(entry.yahooSymbol),
    price,
    move,
    direction,
    note,
    canMoveUp: index > 0,
    canMoveDown: index < count - 1,
    accessibilityLabel,
  };
}

export function watchlistView(input: WatchlistViewInput): WatchlistView {
  const { lists, entries, quotes } = input;
  const nothingYet = lists.length === 0 && entries.length === 0;

  if (nothingYet && input.loadError) {
    return { kind: "error", title: "Couldn't load your watchlists", description: input.loadError };
  }
  if (nothingYet && input.loading) return { kind: "loading" };

  const openList = lists.find((l) => l.id === input.openListId) ?? null;
  const chips: WatchlistChip[] = lists.map((l) => ({ id: l.id, label: l.name, selected: l.id === input.openListId }));

  const quoteBySymbol = new Map(quotes.rows.map((r) => [r.symbol, r]));
  const rows = entries.map((e, i) =>
    watchlistRowView(e, quoteBySymbol.get(e.yahooSymbol), i, entries.length, { fetching: quotes.fetching, nowMs: input.nowMs })
  );

  let banner: BannerView | null = null;
  if (input.loadError) banner = { tone: "error", text: input.loadError, retry: true };
  else if (input.setupError) banner = { tone: "error", text: input.setupError, retry: true };
  else if (rows.length > 0 && quotes.isOffline) banner = { tone: "info", text: "You're offline. Showing saved prices where there are any.", retry: false };
  else if (rows.length > 0 && quotes.errorMessage) banner = { tone: "warning", text: quotes.errorMessage, retry: true };

  let empty: WatchlistEmpty | null = null;
  if (rows.length === 0) {
    empty = lists.length === 0
      ? { title: "Start your watchlist", description: "Add a stock to follow its price. Your watchlist is saved to your account." }
      : { title: "No stocks in this list yet", description: "Add a stock to start tracking it. Prices may be delayed." };
  }

  const count = entries.length;
  return {
    kind: "ready",
    chips,
    open: {
      id: input.openListId,
      name: openList?.name ?? "My watchlist",
      isDefault: openList?.isDefault ?? true,
      canDelete: !!openList && !openList.isDefault,
      countLabel: count === 1 ? "1 stock" : `${count} stocks`,
    },
    canCreateList: lists.length > 0 && canCreateWatchlist(lists),
    banner,
    quotesLabel: count > 0 ? quotes.label : null,
    rows,
    empty,
    addBlocked: canAddToWatchlist(entries) ? null : `A watchlist holds up to ${MAX_ITEMS} stocks. Remove one or use another list.`,
  };
}

export type AddPreview =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "exists"; yahooSymbol: string; message: string }
  | { kind: "ok"; yahooSymbol: string; hint: string };

/** Live feedback for the add form, as the user types. */
export function addSymbolPreview(raw: string, entries: readonly Pick<WatchlistEntry, "yahooSymbol">[]): AddPreview {
  if (!raw.trim()) return { kind: "empty" };
  const yahooSymbol = normalizeWatchSymbol(raw);
  if (!yahooSymbol) return { kind: "invalid", message: "Use a stock symbol like TCS, INFY or RELIANCE.BO." };
  if (entries.some((e) => e.yahooSymbol === yahooSymbol)) {
    return { kind: "exists", yahooSymbol, message: `${displaySymbol(yahooSymbol)} is already in this list.` };
  }
  return { kind: "ok", yahooSymbol, hint: `Adds ${yahooSymbol} (${listingOf(yahooSymbol)})` };
}

const IST_DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * The read-only chart sheet (SPENDLY-646) for a watchlist row. A batch quote's
 * time is its daily bar's session start (09:15 IST), so an index shows the
 * trading day only, never that time.
 */
export function watchlistRowInstrument(row: WatchlistRowView, quote: BatchQuoteDTO | null): Instrument {
  if (row.listing === "Index") {
    return {
      kind: "index",
      item: {
        symbol: row.symbol,
        name: row.name,
        value: row.price ?? "—",
        change: quote?.change != null ? formatSignedPoints(quote.change) : "—",
        changePercent: quote?.changePercent != null ? formatSignedPct(quote.changePercent) : "—",
        direction: row.direction,
        dayRange: null,
        asOf: quote && Number.isFinite(Date.parse(quote.asOf)) ? IST_DAY.format(new Date(quote.asOf)) : "—",
        accessibilityLabel: row.accessibilityLabel,
      },
    };
  }
  const item: MoverView = {
    symbol: row.symbol,
    ticker: row.ticker,
    name: row.name,
    price: row.price ?? "—",
    changePercent: quote?.changePercent != null ? formatSignedPct(quote.changePercent) : "—",
    direction: row.direction,
    accessibilityLabel: row.accessibilityLabel,
    listing: row.listing,
  };
  return { kind: "stock", item };
}
