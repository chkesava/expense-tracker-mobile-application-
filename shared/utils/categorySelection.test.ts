import { describe, expect, it } from "vitest";

import { defaultAccountId, reconcileSubcategory } from "./categorySelection";

describe("reconcileSubcategory (SPENDLY-722)", () => {
  const shopping = ["Accessories", "Footwear", "Clothes"];

  it("keeps a subcategory that belongs to the committed parent", () => {
    expect(reconcileSubcategory("Footwear", shopping)).toBeNull();
  });

  it("switches to the parent's first subcategory when it doesn't belong", () => {
    expect(reconcileSubcategory("Vegetables", shopping)).toBe("Accessories");
  });

  it("leaves a parent without subcategories alone", () => {
    expect(reconcileSubcategory("Other", [])).toBeNull();
  });

  it("settles after one correction, so it can't loop", () => {
    const fixed = reconcileSubcategory("Vegetables", shopping);
    expect(fixed).not.toBeNull();
    expect(reconcileSubcategory(fixed as string, shopping)).toBeNull();
  });
});

describe("defaultAccountId (SPENDLY-722)", () => {
  const ids = ["acct-bank", "acct-cash"];

  it("picks the first account for a new transaction", () => {
    expect(defaultAccountId("", ids)).toBe("acct-bank");
  });

  it("keeps the user's choice when the accounts list refreshes", () => {
    expect(defaultAccountId("acct-cash", ids)).toBe("acct-cash");
    expect(defaultAccountId("acct-cash", ["acct-cash", "acct-bank", "acct-new"])).toBe("acct-cash");
  });

  it("falls back to the first account when the chosen one is gone", () => {
    expect(defaultAccountId("acct-deleted", ids)).toBe("acct-bank");
  });

  it("keeps the current value while accounts are still loading", () => {
    expect(defaultAccountId("", [])).toBe("");
    expect(defaultAccountId("acct-cash", [])).toBe("acct-cash");
  });
});
