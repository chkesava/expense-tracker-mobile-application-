/**
 * SPENDLY-169 regression.
 *
 * The last Expense release ran with the version typed as "v2.1.0", and that
 * value was stored in products/expense.json. The patch bump parsed "v2" as 0,
 * so the next automatic release would have shipped as 0.1.1. These tests pin
 * the normalisation, the ordering and the bump that release.yml relies on.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeVersionName, compareVersionNames, bumpPatchVersion } =
  require("./common.js") as {
    normalizeVersionName: (v: unknown) => string | null;
    compareVersionNames: (a: string, b: string) => number;
    bumpPatchVersion: (v: string) => string;
  };

describe("normalizeVersionName", () => {
  it.each([
    ["2.1.0", "2.1.0"],
    ["v2.1.0", "2.1.0"],
    ["V2.1.0", "2.1.0"],
    ["  2.1.0 ", "2.1.0"],
    ["2.01.0", "2.1.0"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normalizeVersionName(input)).toBe(expected);
  });

  it.each(["", "2.1", "2.1.0.4", "vv2.1.0", "2.1.x", "abc", null, undefined])(
    "rejects %j",
    (input) => {
      expect(normalizeVersionName(input)).toBeNull();
    }
  );
});

describe("compareVersionNames", () => {
  it("orders numerically, not as strings", () => {
    expect(compareVersionNames("2.0.14", "2.1.0")).toBe(-1);
    expect(compareVersionNames("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersionNames("v2.1.0", "2.1.0")).toBe(0);
  });
});

describe("bumpPatchVersion", () => {
  it("bumps a v-prefixed version instead of collapsing it to 0.x", () => {
    expect(bumpPatchVersion("v2.1.0")).toBe("2.1.1");
    expect(bumpPatchVersion("2.0.14")).toBe("2.0.15");
  });

  it("throws on a malformed version instead of inventing one", () => {
    expect(() => bumpPatchVersion("abc")).toThrow(/MAJOR\.MINOR\.PATCH/);
  });
});

describe("products/*.json", () => {
  it.each(["expense", "nutrition", "ganesh", "landing"])(
    "%s stores a canonical version name",
    (product) => {
      const json = JSON.parse(
        readFileSync(resolve(__dirname, `../products/${product}.json`), "utf8")
      ) as { version: string };
      expect(normalizeVersionName(json.version)).toBe(json.version);
    }
  );
});
