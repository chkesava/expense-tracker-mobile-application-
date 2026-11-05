import { describe, expect, it } from "vitest";

import { foldLedgerSnapshot, isStagedPageComplete } from "@/shared/utils/ledgerSnapshot";
import { mapDocument, SPEC_BY_COLLECTION, type ReadModelRow } from "@/shared/utils/readModel/mapping";

import { COPY_LEDGER_WINDOW, copyPendingCount, copySnapshot, loadOlderFromCopy } from "./ledgerWindow";
import { queryCopy } from "./readSource";

const spec = SPEC_BY_COLLECTION.get("expenses")!;
const iso = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 60_000).toISOString();
const expense = (n: number, extra: Record<string, unknown> = {}): ReadModelRow =>
  mapDocument(spec, "u1", { id: `e${n}`, data: { amount: n, date: "2026-10-01", category: "Food", createdAt: iso(n), ...extra }, updateTime: 1 });
const copyOf = (rows: ReadModelRow[]) => ({
  status: () => ({ state: "ready", uid: "u1" }),
  read: async () => rows,
  onChange: () => () => {},
});

describe("the Journal window from the on-device copy (SPENDLY-596)", () => {
  it("is the newest rows by createdAt (a Timestamp), up to the listener's limit", async () => {
    const rows = Array.from({ length: 305 }, (_, i) => expense(i));
    const docs = await queryCopy(copyOf(rows.reverse()), "expenses", COPY_LEDGER_WINDOW);
    expect(docs).toHaveLength(300);
    expect(docs[0].id).toBe("e304");
    expect(docs.at(-1)?.id).toBe("e5");
  });

  it("goes through the same fold: soft-deleted rows drop out, nothing is pending, a short window is complete", async () => {
    const docs = await queryCopy(copyOf([expense(1), expense(2, { deletedAt: "2026-10-02T00:00:00.000Z" }), expense(3)]), "expenses", COPY_LEDGER_WINDOW);
    const snap = copySnapshot(docs);
    const { items, pendingWrites } = foldLedgerSnapshot<{ id?: string; amount?: number }>(snap.docs as never, { activeOnly: true });
    expect(items.map((i) => i.id)).toEqual(["e3", "e1"]);
    expect(items[0]).toMatchObject({ id: "e3", amount: 3 });
    expect(pendingWrites).toBe(0);
    expect(isStagedPageComplete(snap as never)).toBe(true);
  });

  it("a full window is not complete (older rows may exist)", async () => {
    const docs = await queryCopy(copyOf(Array.from({ length: 300 }, (_, i) => expense(i))), "expenses", COPY_LEDGER_WINDOW);
    expect(isStagedPageComplete(copySnapshot(docs) as never)).toBe(false);
  });

  it("older pages follow the window by position until exhausted", async () => {
    const copy = copyOf(Array.from({ length: 7 }, (_, i) => expense(i)));
    const offset = { current: 3 }; // a 3-row window was shown
    const first = await loadOlderFromCopy<{ id?: string }>(copy, "expenses", offset, 2);
    expect(first?.items.map((i) => i.id)).toEqual(["e3", "e2"]);
    expect(first?.exhausted).toBe(false);
    const second = await loadOlderFromCopy<{ id?: string }>(copy, "expenses", offset, 2);
    expect(second?.items.map((i) => i.id)).toEqual(["e1", "e0"]);
    const third = await loadOlderFromCopy<{ id?: string }>(copy, "expenses", offset, 2);
    expect(third).toEqual({ items: [], exhausted: true });
    expect(await loadOlderFromCopy(null, "expenses", offset)).toBeNull();
  });

  it("counts this device's unsent writes for the table as waiting to sync", () => {
    const at = "2026-11-04T00:00:00.000Z";
    const pending = [
      { key: "expenses/a", table: "expenses", uid: "u1", docId: "a", at, attempts: 0 },
      { key: "expenses/b", table: "expenses", uid: "u1", docId: "b", at, attempts: 0 },
      { key: "incomes/c", table: "incomes", uid: "u1", docId: "c", at, attempts: 0 },
    ];
    expect(copyPendingCount(pending, "expenses")).toBe(2);
    expect(copyPendingCount(pending, "incomes")).toBe(1);
  });
});
