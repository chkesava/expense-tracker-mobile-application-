import { describe, expect, it } from "vitest";

import { buildMerchantInsights } from "./merchantInsights";
import { buildMerchantLedgerItems } from "./merchantGrouping";

const expense = (id: string, date: string, amount: number) => ({
  id, date, note: "Swiggy", amount, category: "Food & Groceries", subcategory: "Food Delivery",
} as never);

describe("merchant insights", () => {
  it("deduplicates rows and gates insufficient history", () => {
    const items = buildMerchantLedgerItems([expense("e1", "2026-01-01", 100)], []);
    const result = buildMerchantInsights([items[0]!, items[0]!]);
    expect(result.transactionCount).toBe(1);
    expect(result.observations[0]).toContain("Not enough history");
  });

  it("uses explicit windows for cautious month-over-month observations", () => {
    const items = buildMerchantLedgerItems([
      expense("e1", "2026-01-05", 100), expense("e2", "2026-01-15", 100),
      expense("e3", "2026-02-05", 100), expense("e4", "2026-02-12", 75), expense("e5", "2026-02-20", 75),
    ], []);
    const result = buildMerchantInsights(items, { currentFrom: "2026-02-01", currentTo: "2026-02-28", previousFrom: "2026-01-01", previousTo: "2026-01-31" });
    expect(result.totalSpend).toBe(250);
    expect(result.monthOverMonth).toEqual({ current: 250, previous: 200, change: 50 });
    expect(result.observations.join(" ")).toContain("higher");
  });
});
