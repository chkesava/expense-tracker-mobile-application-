import { describe, expect, it } from "vitest";

import { billedGetReads, collectionKey, createReadInventory, formatReadInventory } from "./readInventory";

const q = (size: number, changes: number, fromCache = false, hasPendingWrites = false) => ({
  kind: "query" as const,
  size,
  changes,
  fromCache,
  hasPendingWrites,
});

describe("collectionKey (SPENDLY-588)", () => {
  it("replaces every document segment, so no uid or id leaks", () => {
    expect(collectionKey("users/u1/expenses")).toBe("users/*/expenses");
    expect(collectionKey("users/u1/accounts/a1/entries")).toBe("users/*/accounts/*/entries");
    expect(collectionKey("users/u1")).toBe("users/*");
    expect(collectionKey("users/u1/financialSummaries/epf")).toBe("users/*/financialSummaries/*");
    expect(collectionKey("system_settings/global")).toBe("system_settings/*");
    expect(collectionKey("splits")).toBe("splits");
  });

  it("is unknown without a path", () => {
    expect(collectionKey(null)).toBe("unknown");
    expect(collectionKey("")).toBe("unknown");
  });
});

describe("billedGetReads", () => {
  it("bills one read per document, at least one per query, none from cache", () => {
    expect(billedGetReads("query", 12, false)).toBe(12);
    expect(billedGetReads("query", 0, false)).toBe(1);
    expect(billedGetReads("doc", 1, false)).toBe(1);
    expect(billedGetReads("doc", 0, false)).toBe(1);
    expect(billedGetReads("query", 12, true)).toBe(0);
  });
});

describe("createReadInventory", () => {
  it("bills a listener's first server snapshot cold (full) and warm (changes only)", () => {
    const inv = createReadInventory();
    const id = inv.attach("users/u1/expenses");
    inv.snapshot(id, q(300, 0, true)); // cache first: not billed
    inv.snapshot(id, q(302, 2)); // server: 2 changed since the cache
    const [row] = inv.rows();
    expect(row).toMatchObject({ key: "users/*/expenses", attaches: 1, open: 1, coldReads: 302, warmReads: 2, cacheDocs: 300 });
  });

  it("bills an empty query one read when cold", () => {
    const inv = createReadInventory();
    const id = inv.attach("users/u1/receivables");
    inv.snapshot(id, q(0, 0));
    expect(inv.rows()[0]).toMatchObject({ coldReads: 1, warmReads: 0 });
  });

  it("bills later server snapshots by changed documents, skipping own pending writes", () => {
    const inv = createReadInventory();
    const id = inv.attach("users/u1/expenses");
    inv.snapshot(id, q(10, 10));
    inv.snapshot(id, q(11, 1, false, true)); // own write, latency-compensated
    inv.snapshot(id, q(11, 1)); // another device's write
    inv.snapshot(id, q(11, 0, true)); // cache echo
    expect(inv.rows()[0]).toMatchObject({ coldReads: 10, updateReads: 1 });
  });

  it("bills a document listener one read per server snapshot", () => {
    const inv = createReadInventory();
    const id = inv.attach("users/u1");
    const doc = { kind: "doc" as const, size: 1, changes: 0, fromCache: false, hasPendingWrites: false };
    inv.snapshot(id, doc);
    inv.snapshot(id, doc);
    expect(inv.rows()[0]).toMatchObject({ key: "users/*", coldReads: 1, warmReads: 1, updateReads: 1 });
  });

  it("tracks open listeners through detach", () => {
    const inv = createReadInventory();
    const a = inv.attach("users/u1/accounts");
    inv.attach("users/u1/accounts");
    inv.detach(a);
    inv.detach(a); // twice is harmless
    expect(inv.rows()[0]).toMatchObject({ attaches: 2, open: 1 });
  });

  it("re-keys an unknown listener from its first document", () => {
    const inv = createReadInventory();
    const id = inv.attach(null);
    inv.rekey(id, "users/u1/categories");
    inv.snapshot(id, q(5, 5));
    expect(inv.rows()).toEqual([expect.objectContaining({ key: "users/*/categories", attaches: 1, coldReads: 5 })]);
  });

  it("counts direct gets", () => {
    const inv = createReadInventory();
    inv.get("users/u1/categories", "query", 287, false);
    inv.get("users/u1/financialSummaries/epf", "doc", 1, false);
    inv.get("users/u1/categories", "query", 287, true);
    expect(inv.totals()).toMatchObject({ directGets: 2, directReads: 288, cacheDocs: 287 });
  });

  it("orders rows by cold-launch cost", () => {
    const inv = createReadInventory();
    inv.snapshot(inv.attach("users/u1/incomes"), q(4, 4));
    inv.snapshot(inv.attach("users/u1/expenses"), q(300, 300));
    inv.get("users/u1/categories", "query", 287, false);
    expect(inv.rows().map((r) => r.key)).toEqual(["users/*/expenses", "users/*/categories", "users/*/incomes"]);
  });

  it("reset starts a new window, keeps open listeners, and treats their next snapshots as updates", () => {
    const inv = createReadInventory();
    const id = inv.attach("users/u1/expenses");
    inv.snapshot(id, q(300, 300));
    inv.reset();
    expect(inv.rows()).toEqual([expect.objectContaining({ key: "users/*/expenses", attaches: 0, open: 1, coldReads: 0 })]);
    inv.snapshot(id, q(301, 1));
    expect(inv.rows()[0]).toMatchObject({ coldReads: 0, updateReads: 1 });
  });

  it("formats a markdown table with a total line", () => {
    const inv = createReadInventory();
    inv.snapshot(inv.attach("users/u1/expenses"), q(3, 3));
    const table = formatReadInventory(inv.rows(), inv.totals(), 61_000);
    expect(table).toContain("Window: 61 s");
    expect(table).toContain("| `users/*/expenses` | 1 | 1 | 3 | 3 | 0 | 0 | 0 | 0 |");
    expect(table).toContain("| **Total** | 1 | 1 | 3 | 3 | 0 | 0 | 0 | 0 |");
    expect(table).not.toContain("u1");
  });
});
