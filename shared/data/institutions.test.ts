import { describe, expect, it } from "vitest";

import {
  inferInstitutionFromDisplayName,
  lookupInstitution,
  searchInstitutions,
} from "./institutions";

describe("searchInstitutions", () => {
  it("ranks Super Money for Super Money / Super Card queries", () => {
    expect(searchInstitutions("Super Money")[0]?.id).toBe("super_money");
    expect(searchInstitutions("super")[0]?.id).toBe("super_money");
    expect(searchInstitutions("Super Card")[0]?.id).toBe("super_money");
  });

  it("returns the catalog A–Z when the query is empty", () => {
    const all = searchInstitutions("");
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((item) => item.name)).toEqual(
      [...all].sort((a, b) => a.name.localeCompare(b.name)).map((item) => item.name)
    );
  });

  it("does not invent an institution from an arbitrary string", () => {
    expect(searchInstitutions("My Custom Bank XYZ")).toEqual([]);
  });
});

describe("institution identity vs display name", () => {
  it("maps Super Money Credit Card to Super Money, not the full label", () => {
    const inferred = inferInstitutionFromDisplayName("Super Money Credit Card");
    expect(inferred?.id).toBe("super_money");
    expect(lookupInstitution("Super Card")?.id).toBe("super_money");
  });
});
