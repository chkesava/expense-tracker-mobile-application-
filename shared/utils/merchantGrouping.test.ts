import { describe, expect, it } from "vitest";

import { buildMerchantLedgerItems, buildMerchantProfiles, merchantProfileId } from "./merchantGrouping";

const expense = (id: string, date: string, note: string, amount: number) => ({
  id, date, note, amount, category: "Food & Groceries", subcategory: "Other Food",
} as never);

describe("merchant grouping", () => {
  it("groups canonical resolutions and keeps unknown text searchable", () => {
    const items = buildMerchantLedgerItems(
      [expense("e1", "2026-01-01", "SWIGGY ORDER", 100), expense("e2", "2026-02-01", "swiggy", 150)],
      [],
    );
    const profiles = buildMerchantProfiles(items);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.displayName).toBe("Swiggy");
    expect(profiles[0]?.totalSpend).toBe(250);
  });

  it("uses a stable unknown profile key", () => {
    const items = buildMerchantLedgerItems([expense("e1", "2026-01-01", "local shop", 20)], []);
    expect(merchantProfileId(items[0]!.resolution)).toMatch(/^unknown:/);
  });
});
