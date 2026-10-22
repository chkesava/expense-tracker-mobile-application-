import { describe, expect, it } from "vitest";

import {
  foldLedgerSnapshot,
  unseenRows,
  FINANCE_SNAPSHOT_LISTEN_OPTIONS,
  isMetadataOnlySnapshot,
  isStagedPageComplete,
  LEDGER_PAGE_SIZE,
  LEDGER_STAGED_LIMIT,
  shouldApplySnapshotDocs,
  sortLedgerByDateDesc,
} from "./ledgerSnapshot";

function doc(
  id: string,
  data: Record<string, unknown>,
  pending = false
): {
  id: string;
  data: () => unknown;
  metadata: { hasPendingWrites: boolean };
} {
  return {
    id,
    data: () => data,
    metadata: { hasPendingWrites: pending },
  };
}

describe("LEDGER_STAGED_LIMIT and LEDGER_PAGE_SIZE (SPENDLY-410)", () => {
  it("uses 300 for staged first-paint page and 50 for cursor pagination", () => {
    expect(LEDGER_STAGED_LIMIT).toBe(300);
    expect(LEDGER_PAGE_SIZE).toBe(50);
  });
});

describe("isStagedPageComplete (SPENDLY-97)", () => {
  function page(length: number, fromCache: boolean) {
    return { docs: { length }, metadata: { fromCache } };
  }

  it("treats a short server page as the whole ledger", () => {
    expect(isStagedPageComplete(page(10, false))).toBe(true);
  });

  it("does not treat a full page as complete — the tail is still unread", () => {
    expect(isStagedPageComplete(page(LEDGER_STAGED_LIMIT, false))).toBe(false);
  });

  it("does not trust a short cache page", () => {
    // A cold cache answers a limited query with whatever it holds. Calling
    // that complete would let statement amounts recompute against nothing.
    expect(isStagedPageComplete(page(10, true))).toBe(false);
    expect(isStagedPageComplete(page(0, true))).toBe(false);
  });

  it("does not treat a full cache page as complete either", () => {
    expect(isStagedPageComplete(page(LEDGER_STAGED_LIMIT, true))).toBe(false);
  });
});

describe("FINANCE_SNAPSHOT_LISTEN_OPTIONS", () => {
  it("asks Firestore for metadata-only snapshots", () => {
    expect(FINANCE_SNAPSHOT_LISTEN_OPTIONS).toEqual({
      includeMetadataChanges: true,
    });
  });
});

describe("isMetadataOnlySnapshot / shouldApplySnapshotDocs", () => {
  it("treats empty default docChanges as metadata-only", () => {
    const snap = { docChanges: () => [] };
    expect(isMetadataOnlySnapshot(snap)).toBe(true);
    expect(shouldApplySnapshotDocs(snap, false)).toBe(true);
    expect(shouldApplySnapshotDocs(snap, true)).toBe(false);
  });

  it("applies document arrays when data actually changed", () => {
    const snap = { docChanges: () => [{ type: "modified" }] };
    expect(isMetadataOnlySnapshot(snap)).toBe(false);
    expect(shouldApplySnapshotDocs(snap, true)).toBe(true);
  });
});

describe("foldLedgerSnapshot", () => {
  it("hydrates in one pass and counts pending writes without a second filter", () => {
    const { items, pendingWrites } = foldLedgerSnapshot<{ id: string; note: string }>([
      doc("a", { note: "live" }),
      doc("b", { note: "queued" }, true),
    ]);
    expect(items).toEqual([
      { id: "a", note: "live" },
      { id: "b", note: "queued" },
    ]);
    expect(pendingWrites).toBe(1);
  });

  it("lets the Firestore id win over a stored id field", () => {
    const { items } = foldLedgerSnapshot<{ id: string }>([doc("real", { id: "stale" })]);
    expect(items[0].id).toBe("real");
  });

  it("drops soft-deleted rows when asked", () => {
    const { items } = foldLedgerSnapshot<{ id: string }>(
      [doc("gone", { deletedAt: "2026-09-01T00:00:00.000Z" }), doc("live", {})],
      { activeOnly: true }
    );
    expect(items.map((row) => row.id)).toEqual(["live"]);
  });
});

describe("sortLedgerByDateDesc", () => {
  it("orders YYYY-MM-DD keys without Date parsing", () => {
    expect(
      sortLedgerByDateDesc([
        { date: "2026-01-02" },
        { date: "2026-09-17" },
        { date: "2025-12-31" },
      ]).map((row) => row.date)
    ).toEqual(["2026-09-17", "2026-01-02", "2025-12-31"]);
  });

  it("does not mutate the input", () => {
    const input = [{ date: "2026-01-01" }, { date: "2026-02-01" }];
    sortLedgerByDateDesc(input);
    expect(input.map((row) => row.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });
});

describe("unseenRows: the live-window boundary (SPENDLY-512)", () => {
  const live = [{ id: "a", v: "live" }, { id: "b", v: "live" }];
  const prev = [{ id: "c", v: "page1" }];

  it("never re-adds a row already in the live window or an earlier page", () => {
    const page = [{ id: "b", v: "page2" }, { id: "c", v: "page2" }, { id: "d", v: "page2" }];
    expect(unseenRows(prev, live, page)).toEqual([{ id: "d", v: "page2" }]);
  });

  it("keeps the page's order and drops rows without an id", () => {
    expect(unseenRows([], [], [{ id: "y" }, { id: "x" }, {}])).toEqual([{ id: "y" }, { id: "x" }]);
  });

  it("the row on screen keeps its local version (an older synced copy never replaces it)", () => {
    const merged = [...prev, ...unseenRows(prev, live, [{ id: "c", v: "stale copy" }])];
    expect(merged).toEqual([{ id: "c", v: "page1" }]);
  });
});
