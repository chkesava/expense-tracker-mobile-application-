import { describe, expect, it } from "vitest";

import { mapDocument, SPEC_BY_COLLECTION } from "./mapping";
import { typedColumns, typedDifferences } from "./parity";

const spec = SPEC_BY_COLLECTION.get("expenses")!;
const expected = mapDocument(spec, "u", {
  id: "e1",
  updateTime: { seconds: 1_790_000_000, nanoseconds: 0 },
  data: { amount: 0.1 + 0.2, date: "2026-10-01", month: "2026-10", category: "Food", deletedAt: "2026-10-02T05:30:00.000Z" },
});
// What PostgREST returns for the stored row.
const stored = {
  amount: 0.3, date: "2026-10-01", month: "2026-10", category: "Food", subcategory: null, account_id: null,
  credit_card_bill_id: null, subscription_id: null, soft_deleted_at: "2026-10-02T05:30:00+00:00", mapping_status: "mapped",
};

describe("read-model field parity (SPENDLY-510)", () => {
  it("covers every typed column plus month and mapping status", () => {
    expect(typedColumns(spec)).toEqual([
      "amount", "date", "category", "subcategory", "account_id", "credit_card_bill_id", "subscription_id", "soft_deleted_at", "month", "mapping_status",
    ]);
  });

  it("treats Postgres's representation of the same values as equal", () => {
    expect(typedDifferences(spec, expected, stored)).toEqual([]);
    expect(typedDifferences(spec, expected, { ...stored, amount: "0.30" })).toEqual([]);
  });

  it("names the columns that differ, never their values", () => {
    const diff = typedDifferences(spec, expected, { ...stored, amount: 999, category: "Fuel", soft_deleted_at: null });
    expect(diff).toEqual(["amount", "category", "soft_deleted_at"]);
    expect(diff.join()).not.toContain("999");
  });

  it("a null on one side only is a difference (missing is never 0)", () => {
    expect(typedDifferences(spec, expected, { ...stored, amount: null })).toEqual(["amount"]);
    expect(typedDifferences(spec, { ...expected, amount: null }, { ...stored, amount: 0 })).toEqual(["amount"]);
  });

  it("SPENDLY-590: decimals compare at numeric(24,8), so a quantity drift is caught", () => {
    const holdings = SPEC_BY_COLLECTION.get("holdings")!;
    const row = mapDocument(holdings, "u", { id: "h1", updateTime: { seconds: 1_790_000_000, nanoseconds: 0 }, data: { symbol: "INFY", quantity: 0.123456789, averageBuyPrice: 1500 } });
    const pg = { profile_id: null, symbol: "INFY", yahoo_symbol: null, name: null, exchange: null, instrument_type: null, quantity: "0.12345679", average_buy_price: "1500.00000000", date_purchased: null, mapping_status: "mapped" };
    expect(typedDifferences(holdings, row, pg)).toEqual([]);
    // Money's 2 places would hide this; decimal does not.
    expect(typedDifferences(holdings, row, { ...pg, quantity: "0.12340000" })).toEqual(["quantity"]);
  });

  it("a missing row is a difference", () => {
    expect(typedDifferences(spec, expected, undefined)).toEqual(["(row missing)"]);
  });
});
