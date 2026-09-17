import { describe, expect, it } from "vitest";

import {
  foldLedgerSnapshot,
  LEDGER_STAGED_LIMIT,
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

describe("LEDGER_STAGED_LIMIT", () => {
  it("is the restored first-paint page, not the whole history", () => {
    expect(LEDGER_STAGED_LIMIT).toBe(300);
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
