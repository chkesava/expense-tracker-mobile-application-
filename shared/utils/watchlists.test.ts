import { describe, expect, it } from "vitest";

import { DEFAULT_WATCHLIST_ID, WATCHLIST_LIMITS, type WatchlistEntry } from "../types/watchlist";
import {
  ORDER_STEP,
  appendOrder,
  canAddToWatchlist,
  canCreateWatchlist,
  checkWatchlistName,
  cleanItemName,
  displaySymbol,
  exchangeFor,
  isValidWatchlistId,
  normalizeWatchSymbol,
  pickOpenWatchlistId,
  planLegacyCopy,
  planMove,
  shouldInitializeWatchlists,
  sortEntries,
  sortWatchlists,
  watchlistDoc,
  watchlistEntryFromDoc,
  watchlistFromDoc,
  watchlistItemDoc,
} from "./watchlists";

/** SPENDLY-654: watchlist rules that don't need Firebase. */

const TS = { sentinel: "serverTimestamp" };
const entry = (id: string, order: number): Pick<WatchlistEntry, "id" | "order" | "yahooSymbol"> => ({ id, order, yahooSymbol: id });

describe("symbols", () => {
  it("normalizes input to the Yahoo symbol used as the item id", () => {
    expect(normalizeWatchSymbol(" tcs ")).toBe("TCS.NS");
    expect(normalizeWatchSymbol("infy.bo")).toBe("INFY.BO");
    expect(normalizeWatchSymbol("M&M")).toBe("M&M.NS");
    expect(normalizeWatchSymbol("bajaj-auto")).toBe("BAJAJ-AUTO.NS");
    expect(normalizeWatchSymbol("^nsei")).toBe("^NSEI");
    expect(normalizeWatchSymbol("aapl")).toBe("AAPL");
  });

  it("refuses what can't be a Yahoo symbol", () => {
    expect(normalizeWatchSymbol("")).toBeNull();
    expect(normalizeWatchSymbol("MF:120503")).toBeNull();
    expect(normalizeWatchSymbol("a/b")).toBeNull();
    expect(normalizeWatchSymbol("X".repeat(30))).toBeNull();
  });

  it("treats differently typed inputs for the same stock as one id (no duplicates)", () => {
    expect(new Set(["tcs", "TCS", " tcs.ns ", "TCS.NS"].map(normalizeWatchSymbol)).size).toBe(1);
  });

  it("derives the display symbol and exchange", () => {
    expect(displaySymbol("TCS.NS")).toBe("TCS");
    expect(displaySymbol("^NSEI")).toBe("^NSEI");
    expect(exchangeFor("TCS.NS")).toBe("NSE");
    expect(exchangeFor("INFY.BO")).toBe("BSE");
    expect(exchangeFor("^NSEI")).toBe("NSE");
    expect(exchangeFor("AAPL")).toBe("US");
  });
});

describe("names and limits", () => {
  it("trims, caps and keeps list names unique ignoring case", () => {
    expect(checkWatchlistName("  IT   picks ", [])).toEqual({ ok: true, name: "IT picks" });
    expect(checkWatchlistName("  ", [])).toMatchObject({ ok: false, message: "Give the watchlist a name." });
    expect(checkWatchlistName("x".repeat(41), [])).toMatchObject({ ok: false });
    expect(checkWatchlistName("it PICKS", [{ id: "a", name: "IT picks" }])).toMatchObject({ ok: false, message: expect.stringMatching(/already/) });
    expect(checkWatchlistName("IT picks", [{ id: "a", name: "IT picks" }], "a")).toEqual({ ok: true, name: "IT picks" });
  });

  it("caps lists and items", () => {
    expect(canCreateWatchlist(new Array(WATCHLIST_LIMITS.lists - 1))).toBe(true);
    expect(canCreateWatchlist(new Array(WATCHLIST_LIMITS.lists))).toBe(false);
    expect(canAddToWatchlist(new Array(WATCHLIST_LIMITS.items - 1))).toBe(true);
    expect(canAddToWatchlist(new Array(WATCHLIST_LIMITS.items))).toBe(false);
  });

  it("cleans item names with a fallback", () => {
    expect(cleanItemName("  Tata   Consultancy ", "TCS")).toBe("Tata Consultancy");
    expect(cleanItemName("", "TCS")).toBe("TCS");
    expect(cleanItemName("x".repeat(200), "TCS")).toHaveLength(WATCHLIST_LIMITS.itemName);
  });

  it("accepts the default id and generated ids only", () => {
    expect(isValidWatchlistId(DEFAULT_WATCHLIST_ID)).toBe(true);
    expect(isValidWatchlistId("wl_mfx2k9_a1b2c3")).toBe(true);
    expect(isValidWatchlistId("bad/id")).toBe(false);
    expect(isValidWatchlistId("")).toBe(false);
  });
});

describe("document shapes", () => {
  it("builds a list document; isDefault follows the id", () => {
    expect(watchlistDoc("default", "My watchlist", TS)).toEqual({ name: "My watchlist", isDefault: true, createdAt: TS, updatedAt: TS });
    expect(watchlistDoc("wl_1", "IT", TS, { createdAt: "old" })).toEqual({ name: "IT", isDefault: false, createdAt: "old", updatedAt: TS });
    expect(watchlistDoc("default", "x", TS, { importedLegacyAt: TS })).toHaveProperty("importedLegacyAt", TS);
  });

  it("builds an item document with the display symbol", () => {
    expect(watchlistItemDoc({ yahooSymbol: "TCS.NS", name: "TCS Ltd", exchange: "NSE", instrumentType: "stock", order: 1024 }, TS)).toEqual({
      symbol: "TCS",
      yahooSymbol: "TCS.NS",
      name: "TCS Ltd",
      exchange: "NSE",
      instrumentType: "stock",
      order: 1024,
      createdAt: TS,
      updatedAt: TS,
    });
  });

  it("never carries money, quantity or account fields", () => {
    const keys = [
      ...Object.keys(watchlistDoc("wl_1", "x", TS, { importedLegacyAt: TS })),
      ...Object.keys(watchlistItemDoc({ yahooSymbol: "A.NS", name: "a", exchange: "NSE", instrumentType: "stock", order: 1 }, TS)),
    ];
    for (const f of ["amount", "quantity", "averagePrice", "avgBuyPrice", "accountId", "investedValue", "date"]) expect(keys).not.toContain(f);
  });
});

describe("reading documents", () => {
  const stamp = (n: number) => ({ toMillis: () => n });

  it("reads lists and items, converting timestamps", () => {
    expect(watchlistFromDoc("default", { name: "Mine", isDefault: true, createdAt: stamp(5), updatedAt: stamp(6) })).toEqual({
      id: "default",
      name: "Mine",
      isDefault: true,
      createdAtMs: 5,
      updatedAtMs: 6,
      importedLegacyAtMs: null,
    });
    expect(watchlistEntryFromDoc("TCS.NS", { yahooSymbol: "TCS.NS", symbol: "TCS", name: "TCS Ltd", exchange: "NSE", instrumentType: "stock", order: 3 })).toMatchObject({
      id: "TCS.NS",
      symbol: "TCS",
      order: 3,
      createdAtMs: null,
    });
  });

  it("ignores documents that don't fit", () => {
    expect(watchlistFromDoc("x", { name: 1 })).toBeNull();
    expect(watchlistEntryFromDoc("TCS.NS", { yahooSymbol: "INFY.NS", order: 1 })).toBeNull();
    expect(watchlistEntryFromDoc("TCS.NS", { yahooSymbol: "TCS.NS" })).toBeNull();
  });

  it("puts the default list first, then by creation", () => {
    const l = (id: string, isDefault: boolean, createdAtMs: number | null) => ({ id, name: id, isDefault, createdAtMs, updatedAtMs: null, importedLegacyAtMs: null });
    expect(sortWatchlists([l("b", false, 2), l("default", true, 9), l("a", false, 1), l("new", false, null)]).map((x) => x.id)).toEqual(["default", "a", "b", "new"]);
  });
});

describe("ordering", () => {
  it("appends after the last item", () => {
    expect(appendOrder([])).toBe(ORDER_STEP);
    expect(appendOrder([{ order: 5 }, { order: 2048 }])).toBe(2048 + ORDER_STEP);
  });

  it("sorts by rank, ties by symbol", () => {
    expect(sortEntries([entry("B", 1), entry("A", 1), entry("C", 0)]).map((e) => e.id)).toEqual(["C", "A", "B"]);
  });

  it("moves with a single write to the midpoint", () => {
    const list = [entry("A", 1024), entry("B", 2048), entry("C", 3072)];
    expect(planMove(list, "C", "up")).toEqual({ kind: "single", id: "C", order: 1536 });
    expect(planMove(list, "A", "down")).toEqual({ kind: "single", id: "A", order: 2560 });
    expect(planMove(list, "B", "up")).toEqual({ kind: "single", id: "B", order: 0 });
    expect(planMove(list, "B", "down")).toEqual({ kind: "single", id: "B", order: 4096 });
  });

  it("does nothing at the ends or for an unknown id", () => {
    const list = [entry("A", 1), entry("B", 2)];
    expect(planMove(list, "A", "up")).toEqual({ kind: "none" });
    expect(planMove(list, "B", "down")).toEqual({ kind: "none" });
    expect(planMove(list, "Z", "up")).toEqual({ kind: "none" });
  });

  it("renumbers everything when the gap is too small to split", () => {
    const list = [entry("A", 1), entry("B", 1 + 1e-7), entry("C", 1 + 2e-7)];
    expect(planMove(list, "C", "up")).toEqual({
      kind: "renumber",
      orders: [
        { id: "A", order: 1024 },
        { id: "C", order: 2048 },
        { id: "B", order: 3072 },
      ],
    });
  });
});

describe("planLegacyCopy", () => {
  it("normalizes, de-duplicates and keeps order; skips what isn't a Yahoo symbol", () => {
    const plan = planLegacyCopy([
      { symbol: "TCS", yahooSymbol: "TCS.NS", name: "Tata Consultancy", instrumentType: "stock" },
      { symbol: "tcs" },
      { yahooSymbol: "INFY.BO", name: "" },
      { yahooSymbol: "MF:120503", name: "Some fund", instrumentType: "mutual_fund" },
      { yahooSymbol: "NIFTYBEES.NS", name: "Nifty ETF", instrumentType: "etf" },
    ]);
    expect(plan.items).toEqual([
      { yahooSymbol: "TCS.NS", name: "Tata Consultancy", exchange: "NSE", instrumentType: "stock", order: 1024 },
      { yahooSymbol: "INFY.BO", name: "INFY", exchange: "BSE", instrumentType: "stock", order: 2048 },
      { yahooSymbol: "NIFTYBEES.NS", name: "Nifty ETF", exchange: "NSE", instrumentType: "etf", order: 3072 },
    ]);
    expect(plan.skipped).toBe(1);
  });

  it("is stable: planning twice gives the same documents", () => {
    const legacy = [{ yahooSymbol: "TCS.NS" }, { yahooSymbol: "INFY.NS" }];
    expect(planLegacyCopy(legacy)).toEqual(planLegacyCopy(legacy));
  });

  it("caps at the per-list limit and counts the rest as skipped", () => {
    const legacy = Array.from({ length: WATCHLIST_LIMITS.items + 3 }, (_, i) => ({ yahooSymbol: `S${i}.NS` }));
    const plan = planLegacyCopy(legacy);
    expect(plan.items).toHaveLength(WATCHLIST_LIMITS.items);
    expect(plan.skipped).toBe(3);
  });
});

describe("open list and first-time setup (SPENDLY-657)", () => {
  const lists = [
    { id: DEFAULT_WATCHLIST_ID, isDefault: true },
    { id: "wl_a", isDefault: false },
  ];

  it("opens the requested list while it exists, else the default, else the first", () => {
    expect(pickOpenWatchlistId(lists, "wl_a")).toBe("wl_a");
    // The requested list was deleted (here or on another device).
    expect(pickOpenWatchlistId(lists, "wl_gone")).toBe(DEFAULT_WATCHLIST_ID);
    expect(pickOpenWatchlistId(lists, null)).toBe(DEFAULT_WATCHLIST_ID);
    expect(pickOpenWatchlistId([{ id: "wl_b", isDefault: false }], undefined)).toBe("wl_b");
  });

  it("opens the default id before any list exists, so a first add lands there", () => {
    expect(pickOpenWatchlistId([], "wl_a")).toBe(DEFAULT_WATCHLIST_ID);
  });

  it("sets up only from server data with no default list, once", () => {
    expect(shouldInitializeWatchlists({ fromCache: false, lists: [], tried: false })).toBe(true);
    expect(shouldInitializeWatchlists({ fromCache: false, lists: [{ isDefault: false }], tried: false })).toBe(true);
  });

  it("never sets up from the cache, a second time, or when the default list exists", () => {
    // A cache snapshot can be missing the default list; setup would overwrite it.
    expect(shouldInitializeWatchlists({ fromCache: true, lists: [], tried: false })).toBe(false);
    expect(shouldInitializeWatchlists({ fromCache: false, lists: [], tried: true })).toBe(false);
    expect(shouldInitializeWatchlists({ fromCache: false, lists: [{ isDefault: true }], tried: false })).toBe(false);
  });
});

describe("the old single watchlist is retired from the portfolio hook (SPENDLY-657)", () => {
  const code = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  };

  it("usePortfolio no longer listens to or writes the legacy watchlist", async () => {
    expect((await code("hooks/usePortfolio.ts")).toLowerCase()).not.toContain("watchlist");
  });

  it("useWatchlists writes only through the store and never touches holdings or money", async () => {
    const source = await code("hooks/useWatchlists.ts");
    for (const word of ["setDoc", "addDoc", "deleteDoc", "updateDoc", "writeBatch", "commitMutations"]) expect(source).not.toContain(word);
    for (const word of ["holdings", "portfolioTransactions", "investmentCash", "accounts", "expenses", "ledger"]) expect(source).not.toContain(word);
  });
});
