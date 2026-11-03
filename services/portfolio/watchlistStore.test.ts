import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Watchlist, WatchlistEntry } from "@/shared/types/watchlist";

/** SPENDLY-655: every watchlist write, through commitMutations. */

type FakeRef = { path: string };
type Op = { op: string; ref: FakeRef; data?: Record<string, unknown> };

const commits: Array<{ uid: string; ops: Op[]; label?: string }> = [];
let stored: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {};
let readFromCache = false;

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  getDocs: vi.fn(async (ref: FakeRef) => ({
    docs: (stored[ref.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
    metadata: { fromCache: readFromCache },
  })),
}));

let db: unknown = { __db: true };
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => db }));

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: vi.fn(async (uid: string, ops: Op[], options?: { label?: string }) => {
    commits.push({ uid, ops, label: options?.label });
    return "acked";
  }),
}));

const store = await import("./watchlistStore");

const UID = "u1";
const TS = { __serverTimestamp: true };
const list = (id: string, name: string, isDefault = id === "default"): Watchlist => ({ id, name, isDefault, createdAtMs: 1, updatedAtMs: 1, importedLegacyAtMs: null });
const entry = (yahooSymbol: string, order: number): WatchlistEntry => ({
  id: yahooSymbol,
  symbol: yahooSymbol.replace(".NS", ""),
  yahooSymbol,
  name: yahooSymbol,
  exchange: "NSE",
  instrumentType: "stock",
  order,
  createdAtMs: 1,
  updatedAtMs: 1,
});

beforeEach(() => {
  commits.length = 0;
  stored = {};
  readFromCache = false;
  db = { __db: true };
});

describe("initializeWatchlists", () => {
  it("creates the default list and copies the old watchlist in one batch, keeping the old documents", async () => {
    const r = await store.initializeWatchlists(UID, [
      { symbol: "TCS", yahooSymbol: "TCS.NS", name: "Tata Consultancy", instrumentType: "stock" },
      { symbol: "tcs" },
      { yahooSymbol: "MF:120503", instrumentType: "mutual_fund" },
      { yahooSymbol: "INFY.NS", name: "Infosys" },
    ]);
    expect(r).toEqual({ ok: true, outcome: "acked", copied: 2, skipped: 1 });
    expect(commits).toHaveLength(1);
    const { ops, label } = commits[0];
    expect(label).toBe("watchlist setup");
    expect(ops.map((o) => [o.op, o.ref.path])).toEqual([
      ["set", "users/u1/watchlists/default"],
      ["set", "users/u1/watchlists/default/items/TCS.NS"],
      ["set", "users/u1/watchlists/default/items/INFY.NS"],
    ]);
    expect(ops[0].data).toEqual({ name: "My watchlist", isDefault: true, createdAt: TS, updatedAt: TS, importedLegacyAt: TS });
    expect(ops[1].data).toMatchObject({ symbol: "TCS", yahooSymbol: "TCS.NS", name: "Tata Consultancy", order: 1024, createdAt: TS, updatedAt: TS });
    // The old flat collection is never written.
    expect(ops.some((o) => o.ref.path.includes("/watchlist/"))).toBe(false);
  });

  it("creates just the default list (no import marker) when there was no old watchlist", async () => {
    await store.initializeWatchlists(UID, []);
    expect(commits[0].ops).toHaveLength(1);
    expect(commits[0].ops[0].data).not.toHaveProperty("importedLegacyAt");
  });

  it("writes the same documents when run twice (another device, or a replay)", async () => {
    const legacy = [{ yahooSymbol: "TCS.NS" }, { yahooSymbol: "INFY.NS" }];
    await store.initializeWatchlists(UID, legacy);
    await store.initializeWatchlists(UID, legacy);
    expect(commits[0].ops.map((o) => o.ref.path)).toEqual(commits[1].ops.map((o) => o.ref.path));
  });

  it("reads the old watchlist", async () => {
    stored["users/u1/watchlist"] = [{ id: "a", data: { yahooSymbol: "TCS.NS" } }];
    expect(await store.readLegacyWatchlist(UID)).toEqual([{ yahooSymbol: "TCS.NS" }]);
  });
});

describe("lists", () => {
  it("creates a named list with a generated id", async () => {
    const r = await store.createWatchlist(UID, "  IT  picks ", [list("default", "Mine")], 1_793_400_000_000);
    expect(r.ok && r.id).toMatch(/^wl_[a-z0-9]+_[a-z0-9]+$/);
    expect(commits[0].ops[0]).toMatchObject({ op: "set", data: { name: "IT picks", isDefault: false, createdAt: TS, updatedAt: TS } });
  });

  it("refuses a duplicate name and the 21st list without writing", async () => {
    expect(await store.createWatchlist(UID, "mine", [list("default", "Mine")])).toMatchObject({ ok: false, message: expect.stringMatching(/already/) });
    const twenty = Array.from({ length: 20 }, (_, i) => list(`wl_${i}`, `L${i}`));
    expect(await store.createWatchlist(UID, "New", twenty)).toMatchObject({ ok: false, message: expect.stringMatching(/up to 20/) });
    expect(commits).toHaveLength(0);
  });

  it("renames with a field update (createdAt untouched)", async () => {
    const r = await store.renameWatchlist(UID, "wl_1", "Banks", [list("wl_1", "IT")]);
    expect(r.ok).toBe(true);
    expect(commits[0].ops[0]).toEqual({ op: "update", ref: { path: "users/u1/watchlists/wl_1" }, data: { name: "Banks", updatedAt: TS } });
    expect(await store.renameWatchlist(UID, "gone", "x", [])).toMatchObject({ ok: false });
  });

  it("deletes a list and every item in it in one batch", async () => {
    stored["users/u1/watchlists/wl_1/items"] = [
      { id: "TCS.NS", data: {} },
      { id: "INFY.NS", data: {} },
    ];
    const r = await store.deleteWatchlist(UID, "wl_1");
    expect(r).toEqual({ ok: true, outcome: "acked", removed: 2 });
    expect(commits[0].ops.map((o) => [o.op, o.ref.path])).toEqual([
      ["delete", "users/u1/watchlists/wl_1/items/TCS.NS"],
      ["delete", "users/u1/watchlists/wl_1/items/INFY.NS"],
      ["delete", "users/u1/watchlists/wl_1"],
    ]);
  });

  it("never deletes the default list", async () => {
    expect(await store.deleteWatchlist(UID, "default")).toMatchObject({ ok: false, message: expect.stringMatching(/can't be deleted/) });
    expect(commits).toHaveLength(0);
  });
});

describe("items", () => {
  it("normalizes the symbol, uses it as the id and appends at the end", async () => {
    const r = await store.addToWatchlist(UID, "wl_1", { symbol: " tcs ", name: "Tata Consultancy" }, [entry("INFY.NS", 2048)]);
    expect(r).toEqual({ ok: true, outcome: "acked", id: "TCS.NS", status: "added" });
    expect(commits[0].ops).toEqual([
      {
        op: "set",
        ref: { path: "users/u1/watchlists/wl_1/items/TCS.NS" },
        data: { symbol: "TCS", yahooSymbol: "TCS.NS", name: "Tata Consultancy", exchange: "NSE", instrumentType: "stock", order: 3072, createdAt: TS, updatedAt: TS },
      },
    ]);
  });

  it("treats a symbol already in the list as a no-op, however it was typed", async () => {
    for (const typed of ["TCS", "tcs.ns", " TCS.NS "]) {
      expect(await store.addToWatchlist(UID, "wl_1", { symbol: typed }, [entry("TCS.NS", 1)])).toEqual({ ok: true, status: "exists", id: "TCS.NS" });
    }
    expect(commits).toHaveLength(0);
  });

  it("refuses a bad symbol and a full list without writing", async () => {
    expect(await store.addToWatchlist(UID, "wl_1", { symbol: "MF:120503" }, [])).toMatchObject({ ok: false });
    const full = Array.from({ length: 50 }, (_, i) => entry(`S${i}.NS`, i));
    expect(await store.addToWatchlist(UID, "wl_1", { symbol: "TCS" }, full)).toMatchObject({ ok: false, message: expect.stringMatching(/up to 50/) });
    expect(commits).toHaveLength(0);
  });

  it("can create the list in the same batch (first add to the default list)", async () => {
    await store.addToWatchlist(UID, "default", { symbol: "^nsei", name: "NIFTY 50" }, [], { ensureList: { name: "My watchlist" } });
    expect(commits[0].ops.map((o) => [o.op, o.ref.path])).toEqual([
      ["set", "users/u1/watchlists/default"],
      ["set", "users/u1/watchlists/default/items/^NSEI"],
    ]);
    expect(commits[0].ops[1].data).toMatchObject({ symbol: "^NSEI", exchange: "NSE", order: 1024 });
  });

  it("removes by symbol", async () => {
    await store.removeFromWatchlist(UID, "wl_1", "TCS.NS");
    expect(commits[0].ops).toEqual([{ op: "delete", ref: { path: "users/u1/watchlists/wl_1/items/TCS.NS" } }]);
  });

  it("moves with one field update, or renumbers in one batch when ranks collapse", async () => {
    const r = await store.moveWatchlistItem(UID, "wl_1", [entry("A.NS", 1024), entry("B.NS", 2048), entry("C.NS", 3072)], "C.NS", "up");
    expect(r).toEqual({ ok: true, outcome: "acked", moved: true });
    expect(commits[0].ops).toEqual([{ op: "update", ref: { path: "users/u1/watchlists/wl_1/items/C.NS" }, data: { order: 1536, updatedAt: TS } }]);

    // C lands between A and B, whose ranks are too close to split.
    await store.moveWatchlistItem(UID, "wl_1", [entry("A.NS", 1), entry("B.NS", 1 + 1e-7), entry("C.NS", 1 + 2e-7)], "C.NS", "up");
    expect(commits[1].ops.map((o) => [o.ref.path, o.data?.order])).toEqual([
      ["users/u1/watchlists/wl_1/items/A.NS", 1024],
      ["users/u1/watchlists/wl_1/items/C.NS", 2048],
      ["users/u1/watchlists/wl_1/items/B.NS", 3072],
    ]);
  });

  it("does nothing when the item is already at the end", async () => {
    expect(await store.moveWatchlistItem(UID, "wl_1", [entry("A.NS", 1)], "A.NS", "up")).toEqual({ ok: true, outcome: "acked", moved: false });
    expect(commits).toHaveLength(0);
  });

  it("passes the offline outcome through (queued while offline)", async () => {
    const { commitMutations } = await import("@/lib/commitMutations");
    vi.mocked(commitMutations).mockResolvedValueOnce("queued");
    expect(await store.removeFromWatchlist(UID, "wl_1", "TCS.NS")).toEqual({ ok: true, outcome: "queued" });
  });
});

describe("no Firebase, no write", () => {
  it("throws when Firestore isn't available", async () => {
    db = null;
    await expect(store.removeFromWatchlist(UID, "wl_1", "TCS.NS")).rejects.toThrow(/Firestore is not available/);
  });
});

describe("watchlists are not holdings", () => {
  it("the store never references holdings, cash, transactions, accounts or the ledger", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("services/portfolio/watchlistStore.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const word of ["holdings", "portfolioTransactions", "investmentCash", "accountEntries", "accounts", "expenses", "incomes", "ledger", "quantity", "averagePrice"]) {
      expect(code).not.toContain(word);
    }
  });
});

describe("stock sheet helpers (SPENDLY-658)", () => {
  const listDoc = (name: string, isDefault: boolean) => ({ name, isDefault, createdAt: { toMillis: () => 1 }, updatedAt: { toMillis: () => 1 } });

  it("offers the existing lists, default first, without writing", async () => {
    stored["users/u1/watchlists"] = [
      { id: "wl_b", data: listDoc("Banks", false) },
      { id: "default", data: listDoc("My watchlist", true) },
    ];
    const r = await store.prepareWatchlistChoices(UID);
    expect(r.ok && r.lists.map((l) => l.id)).toEqual(["default", "wl_b"]);
    expect(commits).toHaveLength(0);
  });

  it("sets up the default list (with the old watchlist) when the server has none", async () => {
    stored["users/u1/watchlist"] = [{ id: "x", data: { yahooSymbol: "TCS.NS", name: "TCS" } }];
    const r = await store.prepareWatchlistChoices(UID);
    expect(r.ok && r.lists.map((l) => [l.id, l.isDefault])).toEqual([["default", true]]);
    expect(commits).toHaveLength(1);
    expect(commits[0].label).toBe("watchlist setup");
    expect(commits[0].ops.map((o) => o.ref.path)).toEqual(["users/u1/watchlists/default", "users/u1/watchlists/default/items/TCS.NS"]);
  });

  it("never sets up from a cache read: the default list may just not have synced", async () => {
    readFromCache = true;
    const r = await store.prepareWatchlistChoices(UID);
    expect(r).toEqual({ ok: false, message: expect.stringContaining("Connect to the internet") });
    expect(commits).toHaveLength(0);
  });

  it("adds to a list that isn't open, after reading its items", async () => {
    stored["users/u1/watchlists/wl_b/items"] = [
      { id: "HDFCBANK.NS", data: { yahooSymbol: "HDFCBANK.NS", name: "HDFC Bank", order: 1024, exchange: "NSE", instrumentType: "stock" } },
    ];
    const r = await store.addToWatchlistById(UID, "wl_b", { symbol: "icicibank", name: "ICICI Bank" });
    expect(r).toMatchObject({ ok: true, status: "added", id: "ICICIBANK.NS" });
    expect(commits[0].ops[0].ref.path).toBe("users/u1/watchlists/wl_b/items/ICICIBANK.NS");
    // Appended after the existing item.
    expect(commits[0].ops[0].data).toMatchObject({ order: 2048 });
  });

  it("reports a stock already in that list without writing", async () => {
    stored["users/u1/watchlists/wl_b/items"] = [
      { id: "TCS.NS", data: { yahooSymbol: "TCS.NS", name: "TCS", order: 1024, exchange: "NSE", instrumentType: "stock" } },
    ];
    expect(await store.addToWatchlistById(UID, "wl_b", { symbol: "TCS" })).toEqual({ ok: true, status: "exists", id: "TCS.NS" });
    expect(commits).toHaveLength(0);
  });
});
