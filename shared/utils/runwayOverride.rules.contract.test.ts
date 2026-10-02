import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RUNWAY_OVERRIDABLE_KINDS } from "../data/runwayRules";
import type { RunwayOverride } from "../types/runway";
import { runwayOverrideId } from "./runwayContract";

/** SPENDLY-207 — the TS override shape and the firestore.rules block must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function runwayOverrideWellFormed("), rules.indexOf("match /runwayOverrides/"));
const quoted = (src: string) => [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe("runway override rules contract", () => {
  it("allows exactly the fields the store writes", () => {
    const allow = quoted(body.match(/hasOnly\(\[([^\]]*)\]\)/)![1]).sort();
    const written: Array<keyof Omit<RunwayOverride, "id">> = ["kind", "refId", "included", "updatedAtMs"];
    expect(allow).toEqual([...written].sort());
  });

  it("accepts exactly the overridable kinds", () => {
    const kinds = quoted(body.match(/d\.kind in \[([^\]]*)\]/)![1]).sort();
    expect(kinds).toEqual([...RUNWAY_OVERRIDABLE_KINDS].sort());
  });

  it("pins the id the same way the client builds it", () => {
    expect(body).toContain("id == d.kind + '__' + d.refId");
    expect(runwayOverrideId("bank", "abc")).toBe("bank" + "__" + "abc");
  });

  it("is registered as a validated collection, not the catch-all", () => {
    const catchAll = rules.slice(rules.indexOf("match /{collection}/{document=**}"));
    expect(catchAll.slice(0, catchAll.indexOf("];"))).not.toContain("runwayOverrides");
  });
});
