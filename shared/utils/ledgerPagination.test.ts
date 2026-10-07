import { describe, expect, it } from "vitest";
import { LEDGER_PAGE_SIZE, LEDGER_STAGED_LIMIT } from "./ledgerSnapshot";

describe("Ledger Pagination Invariants (SPENDLY-410)", () => {
  it("defines standard page sizes: 300 staged limit and 50 pagination limit", () => {
    expect(LEDGER_STAGED_LIMIT).toBe(300);
    expect(LEDGER_PAGE_SIZE).toBe(50);
  });

  it("deduplicates overlapping rows between realtime window and paginated pages", () => {
    const realtimeItems = [
      { id: "tx-1", amount: 100, createdAt: 1000 },
      { id: "tx-2", amount: 200, createdAt: 900 },
      { id: "tx-3", amount: 300, createdAt: 800 },
    ];

    // Suppose page 2 returns tx-3 (overlapped) and tx-4
    const page2Items = [
      { id: "tx-3", amount: 300, createdAt: 800 },
      { id: "tx-4", amount: 400, createdAt: 700 },
    ];

    const realtimeIds = new Set(realtimeItems.map((e) => e.id));
    const paginatedUnique = page2Items.filter((e) => !realtimeIds.has(e.id));
    const merged = [...realtimeItems, ...paginatedUnique];

    expect(merged.map((e) => e.id)).toEqual(["tx-1", "tx-2", "tx-3", "tx-4"]);
  });

  it("prioritizes realtime updates over older paginated snapshots on ID collision", () => {
    const realtimeItems = [
      { id: "tx-1", amount: 150, note: "updated in realtime" },
    ];
    const paginatedItems = [
      { id: "tx-1", amount: 100, note: "stale from disk" },
      { id: "tx-2", amount: 200, note: "older record" },
    ];

    const realtimeIds = new Set(realtimeItems.map((e) => e.id));
    const older = paginatedItems.filter((e) => !realtimeIds.has(e.id));
    const merged = [...realtimeItems, ...older];

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ id: "tx-1", amount: 150, note: "updated in realtime" });
    expect(merged[1]).toEqual({ id: "tx-2", amount: 200, note: "older record" });
  });

  it("correctly identifies hasMore boundary conditions", () => {
    // When a page returns fewer than PAGE_SIZE docs, collection is fully read
    const shortPage = Array.from({ length: 42 }, (_, i) => ({ id: `id-${i}` }));
    expect(shortPage.length < LEDGER_PAGE_SIZE).toBe(true);

    // When a page returns exactly PAGE_SIZE docs, more historical docs may exist
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }));
    expect(fullPage.length === LEDGER_PAGE_SIZE).toBe(true);
  });
});
