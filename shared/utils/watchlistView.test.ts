import { describe, expect, it } from "vitest";

import type { BatchQuoteDTO } from "../types/market";
import type { Watchlist, WatchlistEntry } from "../types/watchlist";
import { instrumentHeader } from "./marketsView";
import type { QuoteRow } from "./stockQuotes";
import { addSymbolPreview, watchlistRowInstrument, watchlistRowView, watchlistView, type WatchlistViewInput } from "./watchlistView";

/** SPENDLY-658: what the Watchlist tab shows in each state. */

const NOW = Date.UTC(2026, 9, 30, 10, 30); // 16:00 IST
const AS_OF = new Date(Date.UTC(2026, 9, 30, 10, 0)).toISOString(); // 15:30 IST

const list = (id: string, name: string, isDefault = id === "default"): Watchlist => ({
  id,
  name,
  isDefault,
  createdAtMs: 1,
  updatedAtMs: 1,
  importedLegacyAtMs: null,
});
const entry = (yahooSymbol: string, name: string, order: number): WatchlistEntry => ({
  id: yahooSymbol,
  symbol: yahooSymbol,
  yahooSymbol,
  name,
  exchange: yahooSymbol.endsWith(".BO") ? "BSE" : "NSE",
  instrumentType: "stock",
  order,
  createdAtMs: 1,
  updatedAtMs: 1,
});
const quote = (symbol: string, price: number, previousClose: number | null, isIndex = false): BatchQuoteDTO => ({
  symbol,
  price,
  previousClose,
  change: previousClose == null ? null : Math.round((price - previousClose) * 10_000) / 10_000,
  changePercent: previousClose == null ? null : Math.round(((price - previousClose) / previousClose) * 1_000_000) / 10_000,
  currency: "INR",
  isIndex,
  asOf: AS_OF,
});
const live = (q: BatchQuoteDTO): QuoteRow => ({ symbol: q.symbol, quote: q, state: "live", savedAt: null });

const LISTS = [list("default", "My watchlist"), list("wl_banks", "Banks")];
const ENTRIES = [entry("TCS.NS", "Tata Consultancy Services", 1024), entry("M&M.NS", "Mahindra & Mahindra", 2048), entry("INFY.BO", "Infosys", 3072)];

function input(over: Partial<WatchlistViewInput> = {}, quotes: Partial<WatchlistViewInput["quotes"]> = {}): WatchlistViewInput {
  return {
    lists: LISTS,
    openListId: "default",
    entries: ENTRIES,
    loading: false,
    loadError: null,
    setupError: null,
    quotes: {
      rows: [live(quote("TCS.NS", 2502.6, 2478)), live(quote("M&M.NS", 2840.3, 2890)), live(quote("INFY.BO", 1182, null))],
      label: "Prices as of 15:30 IST",
      isOffline: false,
      errorMessage: null,
      fetching: false,
      ...quotes,
    },
    nowMs: NOW,
    ...over,
  };
}

function ready(v: ReturnType<typeof watchlistView>) {
  if (v.kind !== "ready") throw new Error(`expected ready, got ${v.kind}`);
  return v;
}

describe("watchlistView: states", () => {
  it("is loading only while there is nothing at all to show", () => {
    expect(watchlistView(input({ lists: [], entries: [], loading: true }))).toEqual({ kind: "loading" });
    // Lists already here: show them while the items load.
    expect(watchlistView(input({ entries: [], loading: true })).kind).toBe("ready");
  });

  it("is an error when the lists failed and nothing is on screen", () => {
    expect(watchlistView(input({ lists: [], entries: [], loadError: "Couldn't load your watchlists." }))).toEqual({
      kind: "error",
      title: "Couldn't load your watchlists",
      description: "Couldn't load your watchlists.",
    });
  });

  it("keeps the lists on screen with a Retry banner when a later load fails", () => {
    const v = ready(watchlistView(input({ loadError: "Couldn't load this watchlist." })));
    expect(v.rows).toHaveLength(3);
    expect(v.banner).toEqual({ tone: "error", text: "Couldn't load this watchlist.", retry: true });
  });

  it("shows a setup failure with Retry", () => {
    expect(ready(watchlistView(input({ lists: [], entries: [], setupError: "Couldn't set up your watchlist." }))).banner).toEqual({
      tone: "error",
      text: "Couldn't set up your watchlist.",
      retry: true,
    });
  });

  it("has an empty state before any list exists, and another for an empty list", () => {
    expect(ready(watchlistView(input({ lists: [], entries: [] }))).empty?.title).toBe("Start your watchlist");
    const v = ready(watchlistView(input({ entries: [], openListId: "wl_banks" })));
    expect(v.empty?.title).toBe("No stocks in this list yet");
    expect(v.quotesLabel).toBeNull();
    expect(v.banner).toBeNull();
  });
});

describe("watchlistView: lists", () => {
  it("draws a chip per list with the open one selected", () => {
    const v = ready(watchlistView(input({ openListId: "wl_banks" })));
    expect(v.chips).toEqual([
      { id: "default", label: "My watchlist", selected: false },
      { id: "wl_banks", label: "Banks", selected: true },
    ]);
    expect(v.open).toEqual({ id: "wl_banks", name: "Banks", isDefault: false, canDelete: true, countLabel: "3 stocks" });
  });

  it("never offers to delete the default list", () => {
    expect(ready(watchlistView(input())).open).toMatchObject({ isDefault: true, canDelete: false });
  });

  it("stops new lists at 20 and new stocks at 50", () => {
    const many = Array.from({ length: 20 }, (_, i) => list(i === 0 ? "default" : `wl_${i}`, `L${i}`));
    expect(ready(watchlistView(input({ lists: many }))).canCreateList).toBe(false);
    expect(ready(watchlistView(input())).canCreateList).toBe(true);
    const full = Array.from({ length: 50 }, (_, i) => entry(`S${i}.NS`, `S${i}`, (i + 1) * 1024));
    expect(ready(watchlistView(input({ entries: full }))).addBlocked).toContain("up to 50 stocks");
    expect(ready(watchlistView(input())).addBlocked).toBeNull();
  });
});

describe("watchlistView: rows", () => {
  it("shows price, signed rupee change and percent, in list order", () => {
    const v = ready(watchlistView(input()));
    expect(v.rows.map((r) => r.ticker)).toEqual(["TCS", "M&M", "INFY"]);
    expect(v.rows[0]).toMatchObject({ price: "₹2,502.60", move: "+₹24.60 (+0.99%)", direction: "up", listing: "NSE", note: null });
    expect(v.rows[1]).toMatchObject({ move: "-₹49.70 (-1.72%)", direction: "down" });
    expect(v.rows[0].accessibilityLabel).toBe("Tata Consultancy Services, TCS, ₹2,502.60, up 0.99 percent");
  });

  it("shows a price without a change when there's no previous close", () => {
    expect(ready(watchlistView(input())).rows[2]).toMatchObject({ listing: "BSE", price: "₹1,182.00", move: null, direction: "flat" });
  });

  it("enables up only below the first row and down only above the last", () => {
    const v = ready(watchlistView(input()));
    expect(v.rows.map((r) => [r.canMoveUp, r.canMoveDown])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
  });

  it("keeps every stock when prices fail: unavailable, unknown, loading and saved", () => {
    const rows: QuoteRow[] = [
      { symbol: "TCS.NS", quote: quote("TCS.NS", 2490, 2478), state: "saved", savedAt: AS_OF },
      { symbol: "M&M.NS", quote: null, state: "unknown", savedAt: null },
      { symbol: "INFY.BO", quote: null, state: "unavailable", savedAt: null },
    ];
    const v = ready(watchlistView(input({}, { rows, errorMessage: "Market data is unavailable right now.", label: null })));
    expect(v.rows).toHaveLength(3);
    expect(v.rows.map((r) => r.note)).toEqual(["Saved 15:30 IST", "Not found on Yahoo Finance", "Price unavailable"]);
    expect(v.banner).toEqual({ tone: "warning", text: "Market data is unavailable right now.", retry: true });
    expect(ready(watchlistView(input({}, { rows: [], fetching: true }))).rows[0].note).toBe("Loading price…");
  });

  it("says offline without a Retry, instead of a quote error", () => {
    const v = ready(watchlistView(input({}, { isOffline: true, errorMessage: "x" })));
    expect(v.banner).toEqual({ tone: "info", text: "You're offline. Showing saved prices where there are any.", retry: false });
  });

  it("shows an index in points, not rupees", () => {
    const r = watchlistRowView(entry("^NSEI", "NIFTY 50", 1), live(quote("^NSEI", 23053.1, 22936.75, true)), 0, 1, { fetching: false, nowMs: NOW });
    expect(r).toMatchObject({ ticker: "^NSEI", listing: "Index", price: "23,053.10", move: "+116.35 (+0.51%)" });
  });
});

describe("addSymbolPreview", () => {
  it("normalizes as you type and names the exchange", () => {
    expect(addSymbolPreview("", ENTRIES)).toEqual({ kind: "empty" });
    expect(addSymbolPreview("hdfcbank", ENTRIES)).toEqual({ kind: "ok", yahooSymbol: "HDFCBANK.NS", hint: "Adds HDFCBANK.NS (NSE)" });
    expect(addSymbolPreview("reliance.bo", ENTRIES)).toMatchObject({ kind: "ok", yahooSymbol: "RELIANCE.BO", hint: "Adds RELIANCE.BO (BSE)" });
  });

  it("says when a stock is already in the list", () => {
    expect(addSymbolPreview(" tcs ", ENTRIES)).toEqual({ kind: "exists", yahooSymbol: "TCS.NS", message: "TCS is already in this list." });
  });

  it("rejects text that can't be a symbol", () => {
    expect(addSymbolPreview("tata consultancy", ENTRIES).kind).toBe("invalid");
  });
});

describe("watchlistRowInstrument", () => {
  it("opens a stock sheet with its own exchange, not 'NIFTY 50'", () => {
    const q = quote("INFY.BO", 1182, 1143.45);
    const row = watchlistRowView(entry("INFY.BO", "Infosys", 1), live(q), 0, 1, { fetching: false, nowMs: NOW });
    const instrument = watchlistRowInstrument(row, q);
    expect(instrument.kind).toBe("stock");
    expect(instrumentHeader(instrument)).toMatchObject({ title: "Infosys", subtitle: "INFY · BSE", value: "₹1,182.00", move: "+3.37%" });
  });

  it("opens an index sheet for an index, and copes with no price", () => {
    const row = watchlistRowView(entry("^NSEI", "NIFTY 50", 1), undefined, 0, 1, { fetching: false, nowMs: NOW });
    expect(instrumentHeader(watchlistRowInstrument(row, null))).toMatchObject({ title: "NIFTY 50", value: "—", move: "— (—)" });
  });

  it("dates an index by its trading day, not the bar's 09:15 session start", () => {
    const q = { ...quote("^NSEI", 23053.1, 22936.75, true), asOf: "2026-10-30T03:45:00.000Z" };
    const row = watchlistRowView(entry("^NSEI", "NIFTY 50", 1), live(q), 0, 1, { fetching: false, nowMs: NOW });
    expect(instrumentHeader(watchlistRowInstrument(row, q)).subtitle).toBe("Index · as of 30 Oct");
  });
});
