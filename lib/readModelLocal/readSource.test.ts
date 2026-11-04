import { describe, expect, it, vi } from "vitest";

import { Timestamp } from "@/lib/firestore";
import { mapDocument, SPEC_BY_COLLECTION, type ReadModelRow } from "@/shared/utils/readModel/mapping";

import { createCollectionSource, queryCopy, rowToDoc, SHADOW_LOG_MS } from "./readSource";

const bills = SPEC_BY_COLLECTION.get("creditCardBills")!;
const billRow = (id: string, statementAmount: number, extra: Record<string, unknown> = {}) =>
  mapDocument(bills, "u1", {
    id,
    data: { accountId: "card", dueDate: "2026-10-25", statementAmount, amountPaid: 0, createdAt: "2026-10-01T00:00:00.000Z", ...extra },
    updateTime: 1,
  });

/** A stand-in for the on-device copy (SPENDLY-594). */
function fakeCopy(rows: Record<string, ReadModelRow[]>, state = "ready") {
  const listeners = new Set<(t: string[]) => void>();
  return {
    rows,
    failNext: false,
    status: () => ({ state, uid: "u1" }),
    read: vi.fn(async function (this: unknown, table: string) {
      return rows[table] ?? [];
    }),
    onChange(l: (t: string[]) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    emit: (tables: string[]) => listeners.forEach((l) => l(tables)),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("read store over the on-device copy (SPENDLY-673)", () => {
  it("gives providers the documents Firestore would: the source doc, id, timestamps restored", () => {
    const doc = rowToDoc(billRow("b1", 1000));
    expect(doc.id).toBe("b1");
    expect(doc.data).toMatchObject({ id: "b1", accountId: "card", statementAmount: 1000 });
    expect(doc.data.createdAt).toBeInstanceOf(Timestamp);
    // A nested row's id is its own, not "{parentId}/{id}".
    const items = SPEC_BY_COLLECTION.get("watchlists/items")!;
    expect(rowToDoc(mapDocument(items, "u1", { id: "default/INFY.NS", data: { symbol: "INFY" }, updateTime: 1 })).id).toBe("INFY.NS");
  });

  it("filters, orders and limits on the device", async () => {
    const copy = fakeCopy({ credit_card_bills: [billRow("b1", 300), billRow("b2", 100), billRow("b3", 200), billRow("b4", 50, { accountId: "other" })] });
    const docs = await queryCopy(copy, "creditCardBills", {
      where: (d) => d.data.accountId === "card",
      orderBy: [{ field: "statementAmount", direction: "desc" }],
      limit: 2,
    });
    expect(docs.map((d) => d.id)).toEqual(["b1", "b3"]);
    await expect(queryCopy(copy, "notSynced")).rejects.toThrow(/not synced/);
  });

  it("subscribe delivers now and again when the copy changes that table only", async () => {
    const copy = fakeCopy({ credit_card_bills: [billRow("b1", 300)] });
    const source = createCollectionSource({ collection: "creditCardBills", copy: () => copy });
    const seen: string[][] = [];
    const off = source.subscribe((docs) => seen.push(docs.map((d) => d.id)), () => {});
    await flush();
    copy.rows.credit_card_bills = [billRow("b1", 300), billRow("b2", 1)];
    copy.emit(["expenses"]);
    await flush();
    copy.emit(["credit_card_bills"]);
    await flush();
    off();
    copy.emit(["credit_card_bills"]);
    await flush();
    expect(seen).toEqual([["b1"], ["b1", "b2"]]);
  });

  it("a failure (no copy, or a read error) calls onError so the provider falls back", async () => {
    const onError = vi.fn();
    createCollectionSource({ collection: "creditCardBills", copy: () => null }).subscribe(() => {}, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    const copy = fakeCopy({});
    copy.read.mockRejectedValueOnce(new Error("disk"));
    createCollectionSource({ collection: "creditCardBills", copy: () => copy }).subscribe(() => {}, onError);
    await flush();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("shadow logs counts when the copy differs, at most once per window, and nothing when clean", async () => {
    const copy = fakeCopy({ credit_card_bills: [billRow("b1", 1000)] });
    const log = vi.fn();
    let now = 0;
    const source = createCollectionSource({ collection: "creditCardBills", copy: () => copy, log, now: () => now });
    const firestore = [{ id: "b1", data: billRow("b1", 1000).doc as Record<string, unknown> }];
    expect(await source.shadow(firestore)).toMatchObject({ missing: 0, extra: 0, differing: 0 });
    expect(log).not.toHaveBeenCalled();
    const changed = [{ id: "b1", data: { ...firestore[0].data, statementAmount: 1200 } }];
    await source.shadow(changed);
    await source.shadow(changed);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("readModel.shadow.creditCardBills");
    expect(log.mock.calls[0][1]).toMatchObject({ differing: 1, columns: { statement_amount: 1 } });
    now += SHADOW_LOG_MS;
    await source.shadow(changed);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("shadow does nothing until the copy is ready", async () => {
    const copy = fakeCopy({ credit_card_bills: [] }, "hydrating");
    const source = createCollectionSource({ collection: "creditCardBills", copy: () => copy });
    expect(await source.shadow([{ id: "b1", data: {} }])).toBeNull();
    expect(copy.read).not.toHaveBeenCalled();
  });
});
