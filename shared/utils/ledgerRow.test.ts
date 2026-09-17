import { describe, expect, it } from "vitest";

import {
  activeLedgerRows,
  isActiveLedgerRow,
  ledgerEventSnapshot,
} from "./ledgerRow";

describe("isActiveLedgerRow", () => {
  it("treats a missing deletedAt as live", () => {
    expect(isActiveLedgerRow({})).toBe(true);
  });

  it("treats a blank deletedAt as live", () => {
    expect(isActiveLedgerRow({ deletedAt: "" })).toBe(true);
    expect(isActiveLedgerRow({ deletedAt: "   " })).toBe(true);
  });

  it("treats a set ISO deletedAt as removed", () => {
    expect(isActiveLedgerRow({ deletedAt: "2026-09-17T00:00:00.000Z" })).toBe(
      false
    );
  });

  it("treats a Timestamp-like object as removed", () => {
    expect(isActiveLedgerRow({ deletedAt: { seconds: 1 } })).toBe(false);
  });

  it("filters arrays to live rows", () => {
    expect(
      activeLedgerRows([
        { id: "keep" },
        { id: "gone", deletedAt: "2026-09-17T00:00:00.000Z" },
      ]).map((row) => row.id)
    ).toEqual(["keep"]);
  });
});

describe("ledgerEventSnapshot", () => {
  it("keeps primitive money fields and drops timestamps", () => {
    expect(
      ledgerEventSnapshot({
        amount: 500,
        category: "Food",
        subcategory: "Groceries",
        date: "2026-09-01",
        month: "2026-09",
        accountId: "bank-1",
        note: "Lunch",
        tags: ["work"],
        tripId: "trip-1",
        createdAt: { seconds: 1 },
      })
    ).toEqual({
      amount: 500,
      category: "Food",
      subcategory: "Groceries",
      date: "2026-09-01",
      month: "2026-09",
      accountId: "bank-1",
      note: "Lunch",
      tags: ["work"],
      tripId: "trip-1",
    });
  });

  it("omits empty optional links", () => {
    expect(
      ledgerEventSnapshot({
        amount: 10,
        date: "2026-09-01",
        month: "2026-09",
        source: "Salary",
        note: "",
        accountId: null,
      })
    ).toEqual({
      amount: 10,
      date: "2026-09-01",
      month: "2026-09",
      accountId: null,
      note: "",
      source: "Salary",
    });
  });
});
