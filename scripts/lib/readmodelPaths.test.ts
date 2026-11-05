import { describe, expect, it } from "vitest";

import { SPEC_BY_COLLECTION } from "../../shared/utils/readModel/mapping";
import { userDocOf } from "./readmodelPaths";

const spec = (c: string) => SPEC_BY_COLLECTION.get(c)!;

describe("collection-group result paths (SPENDLY-672)", () => {
  it("keeps only this spec's users/{uid}/… documents", () => {
    expect(userDocOf(spec("expenses"), "users/u1/expenses/e1")).toEqual({ uid: "u1", id: "e1" });
    // Same-named collections elsewhere (a Ganesh pandal's expenses) are never copied.
    expect(userDocOf(spec("expenses"), "pandals/p1/expenses/e1")).toBeNull();
    expect(userDocOf(spec("expenses"), "users/u1/trips/t1/expenses/e1")).toBeNull();
    expect(userDocOf(spec("categories"), "nutrition/x/categories/c1")).toBeNull();
  });

  it("gives a nested row its composite id, and refuses other nestings", () => {
    const items = spec("watchlists/items");
    expect(userDocOf(items, "users/u1/watchlists/default/items/INFY.NS")).toEqual({ uid: "u1", id: "default/INFY.NS" });
    expect(userDocOf(items, "users/u1/orders/o1/items/x")).toBeNull();
    expect(userDocOf(items, "pandals/p/items/x")).toBeNull();
  });
});
