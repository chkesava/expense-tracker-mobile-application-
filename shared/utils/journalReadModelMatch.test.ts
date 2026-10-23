import { describe, expect, it } from "vitest";

import { createEmptyAccountActivityFilters } from "./accountActivityFilters";
import { journalMatchFromFilters } from "./journalReadModelMatch";

const accounts = [
  { id: "hdfc1", name: "HDFC" },
  { id: "hdfc2", name: "HDFC" },
  { id: "sbi", name: "SBI" },
];
const scope = { fromDate: "2026-01-01", toDate: "2026-03-31" };
const f = (over: Partial<ReturnType<typeof createEmptyAccountActivityFilters>>) => ({ ...createEmptyAccountActivityFilters(), ...over });

describe("Journal filter → read-model match (SPENDLY-512)", () => {
  it("is null for plain browsing (no category, account or amount condition)", () => {
    expect(journalMatchFromFilters(f({}), scope, accounts)).toBeNull();
    expect(journalMatchFromFilters(f({ tags: ["x"], kind: "income" }), scope, accounts)).toBeNull();
  });

  it("carries categories, the date scope and amounts", () => {
    expect(journalMatchFromFilters(f({ categories: ["Food"], minAmount: "100", maxAmount: "500.5" }), scope, accounts)).toEqual({
      categories: ["Food"], minAmount: 100, maxAmount: 500.5, fromDate: "2026-01-01", toDate: "2026-03-31",
    });
  });

  it("maps account names to every account with that name", () => {
    expect(journalMatchFromFilters(f({ accounts: ["HDFC"] }), { fromDate: "", toDate: "" }, accounts)).toEqual({ accountIds: ["hdfc1", "hdfc2"] });
  });

  it("is null when an account filter names no known account (nothing could match)", () => {
    expect(journalMatchFromFilters(f({ accounts: ["Gone"] }), scope, accounts)).toBeNull();
  });

  it("ignores amounts that aren't numbers, as the screen does", () => {
    expect(journalMatchFromFilters(f({ minAmount: "abc" }), scope, accounts)).toBeNull();
  });
});
