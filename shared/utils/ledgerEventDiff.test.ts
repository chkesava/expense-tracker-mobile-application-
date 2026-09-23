import { describe, expect, it } from "vitest";

import type {
  LedgerEvent,
  LedgerEventSnapshot,
} from "@/shared/types/ledgerEvent";
import {
  diffLedgerEvent,
  diffLedgerSnapshots,
  selectEventsForRow,
  summarizeLedgerEvent,
} from "./ledgerEventDiff";

function snapshot(over: Partial<LedgerEventSnapshot> = {}): LedgerEventSnapshot {
  return {
    amount: 500,
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-bank",
    note: "Swiggy dinner",
    category: "Food & Groceries",
    ...over,
  };
}

function event(over: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: "ev1",
    kind: "expense",
    docId: "e1",
    action: "update",
    before: snapshot(),
    after: snapshot(),
    actorUid: "u1",
    createdAt: null,
    ...over,
  };
}

describe("ledger event diff (SPENDLY-110)", () => {
  describe("field changes", () => {
    it("reports an amount change with both values", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ amount: 500 }),
        snapshot({ amount: 650 })
      );
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        field: "amount",
        label: "Amount",
        before: 500,
        after: 650,
        isMoney: true,
      });
    });

    it("reports several changes in display order, amount first", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ amount: 500, note: "old", category: "Food & Groceries" }),
        snapshot({ amount: 650, note: "new", category: "Travel" })
      );
      expect(changes.map((c) => c.field)).toEqual(["amount", "category", "note"]);
    });

    it("returns nothing when the snapshots match", () => {
      expect(diffLedgerSnapshots(snapshot(), snapshot())).toEqual([]);
    });

    it("marks only money fields as money", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ amount: 1, note: "a" }),
        snapshot({ amount: 2, note: "b" })
      );
      expect(changes.find((c) => c.field === "amount")?.isMoney).toBe(true);
      expect(changes.find((c) => c.field === "note")?.isMoney).toBe(false);
    });
  });

  describe("empty-value normalization", () => {
    it("treats null and empty string as the same absence", () => {
      // accountId is `string | null` while note is `""` — without this, every
      // event would report spurious changes on untouched fields.
      expect(
        diffLedgerSnapshots(
          snapshot({ accountId: null }),
          snapshot({ accountId: "" as unknown as string })
        )
      ).toEqual([]);
    });

    it("treats whitespace as absent", () => {
      expect(
        diffLedgerSnapshots(snapshot({ note: "" }), snapshot({ note: "   " }))
      ).toEqual([]);
    });

    it("reports setting a previously empty field", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ accountId: null }),
        snapshot({ accountId: "acc-hdfc" })
      );
      expect(changes[0]).toMatchObject({
        field: "accountId",
        before: undefined,
        after: "acc-hdfc",
      });
    });

    it("reports clearing a field", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ accountId: "acc-hdfc" }),
        snapshot({ accountId: null })
      );
      expect(changes[0]).toMatchObject({ before: "acc-hdfc", after: undefined });
    });
  });

  describe("tags", () => {
    it("ignores reordering", () => {
      expect(
        diffLedgerSnapshots(
          snapshot({ tags: ["a", "b"] }),
          snapshot({ tags: ["b", "a"] })
        )
      ).toEqual([]);
    });

    it("ignores falsy entries", () => {
      expect(
        diffLedgerSnapshots(
          snapshot({ tags: ["a"] }),
          snapshot({ tags: ["a", ""] })
        )
      ).toEqual([]);
    });

    it("reports a genuinely added tag", () => {
      const changes = diffLedgerSnapshots(
        snapshot({ tags: ["a"] }),
        snapshot({ tags: ["a", "b"] })
      );
      expect(changes[0]).toMatchObject({ field: "tags", after: "a, b" });
    });

    it("treats an empty tag list as absent", () => {
      expect(
        diffLedgerSnapshots(snapshot({ tags: [] }), snapshot({ tags: undefined }))
      ).toEqual([]);
    });
  });

  describe("deletes", () => {
    it("reports no field changes for a delete", () => {
      // A delete is not "every field cleared"; callers render it as its own
      // thing rather than as fifteen changes.
      expect(diffLedgerSnapshots(snapshot(), null)).toEqual([]);
    });

    it("summarizes a delete with its reason", () => {
      const summary = summarizeLedgerEvent(
        event({ action: "delete", after: null, reason: "Duplicate of the card row" })
      );
      expect(summary).toMatchObject({
        tone: "removed",
        label: "Deleted",
        detail: "Duplicate of the card row",
      });
      expect(summary.changes).toEqual([]);
    });

    it("falls back to standard copy when no reason was given", () => {
      const summary = summarizeLedgerEvent(event({ action: "delete", after: null }));
      expect(summary.detail).toBe("Removed from the ledger");
    });
  });

  describe("restores", () => {
    it("summarizes a restore", () => {
      const summary = summarizeLedgerEvent(
        event({ action: "restore", reason: "Deleted by mistake" })
      );
      expect(summary).toMatchObject({
        tone: "restored",
        label: "Restored",
        detail: "Deleted by mistake",
      });
    });

    it("falls back to standard copy", () => {
      expect(summarizeLedgerEvent(event({ action: "restore" })).detail).toBe(
        "Returned to the ledger"
      );
    });
  });

  describe("edits", () => {
    it("names the changed fields", () => {
      const summary = summarizeLedgerEvent(
        event({
          before: snapshot({ amount: 500, note: "a" }),
          after: snapshot({ amount: 650, note: "b" }),
        })
      );
      expect(summary.tone).toBe("edited");
      expect(summary.detail).toBe("Amount, Note changed");
      expect(summary.changes).toHaveLength(2);
    });

    it("prefers an explicit reason over the field list", () => {
      const summary = summarizeLedgerEvent(
        event({
          before: snapshot({ amount: 500 }),
          after: snapshot({ amount: 650 }),
          reason: "Corrected from the receipt",
        })
      );
      expect(summary.detail).toBe("Corrected from the receipt");
      // The changes are still available for display.
      expect(summary.changes).toHaveLength(1);
    });

    it("says so when an edit changed nothing visible", () => {
      expect(summarizeLedgerEvent(event()).detail).toBe(
        "Saved with no visible change"
      );
    });

    it("treats an unrecognised action as an edit rather than hiding it", () => {
      // `action` is a stored string; a newer or older client may write a value
      // this build does not know. Losing audit history would be worse than
      // labelling it imprecisely.
      const summary = summarizeLedgerEvent(
        event({ action: "reverse" as LedgerEvent["action"] })
      );
      expect(summary.tone).toBe("edited");
      expect(summary.label).toBe("Edited");
    });
  });

  describe("diffLedgerEvent", () => {
    it("diffs the event's own snapshots", () => {
      const changes = diffLedgerEvent(
        event({ before: snapshot({ amount: 1 }), after: snapshot({ amount: 2 }) })
      );
      expect(changes).toHaveLength(1);
    });
  });

  describe("selectEventsForRow", () => {
    const events = [
      event({ id: "a", docId: "e1", kind: "expense" }),
      event({ id: "b", docId: "e2", kind: "expense" }),
      event({ id: "c", docId: "e1", kind: "income" }),
      event({ id: "d", docId: "e1", kind: "expense" }),
    ];

    it("returns only this row's events", () => {
      expect(
        selectEventsForRow(events, "expense", "e1").map((e) => e.id)
      ).toEqual(["a", "d"]);
    });

    it("does not confuse an expense with an income sharing an id", () => {
      expect(selectEventsForRow(events, "income", "e1").map((e) => e.id)).toEqual([
        "c",
      ]);
    });

    it("preserves the incoming order rather than re-sorting", () => {
      // The hook already orders by createdAt desc; re-sorting here could
      // disagree for events written in the same millisecond.
      const selected = selectEventsForRow(events, "expense", "e1");
      expect(selected[0].id).toBe("a");
    });

    it("returns nothing for a row with no id", () => {
      expect(selectEventsForRow(events, "expense", undefined)).toEqual([]);
    });

    it("returns nothing when there are no matches", () => {
      expect(selectEventsForRow(events, "expense", "nope")).toEqual([]);
    });
  });
});
