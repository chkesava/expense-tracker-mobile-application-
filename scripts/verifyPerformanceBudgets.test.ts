import { describe, expect, it } from "vitest";
import {
  findOnSnapshotCollections,
  isCollectionQueryBounded,
  verifyNoDuplicateListeners,
  verifyOnDemandGatingPresent,
  verifyReferenceQueriesBounded,
  verifyStartupGuardrails,
} from "./verify-performance-budgets";

describe("verifyStartupGuardrails", () => {
  it("executes cleanly against the current codebase with zero violations", () => {
    const result = verifyStartupGuardrails();
    expect(result).toBe(true);
  });
});

// SPENDLY-415: regression guards added on top of the existing startup checks.
describe("findOnSnapshotCollections (SPENDLY-415)", () => {
  it("finds the collection name nearest each onSnapshot( call", () => {
    const content = `
      const unsub = onSnapshot(
        query(collection(db, "users", uid, "widgets")),
        (snap) => {}
      );
    `;
    expect(findOnSnapshotCollections(content)).toEqual(new Set(["widgets"]));
  });

  it("finds a spread-base collection() call too", () => {
    const content = `
      const unsub = onSnapshot(
        query(collection(db, ...base, "borrowings"), orderBy("date")),
        (snap) => {}
      );
    `;
    expect(findOnSnapshotCollections(content)).toEqual(new Set(["borrowings"]));
  });

  it("returns an empty set when there is no onSnapshot call", () => {
    expect(findOnSnapshotCollections("export const x = 1;")).toEqual(new Set());
  });
});

describe("verifyNoDuplicateListeners (SPENDLY-415)", () => {
  it("finds zero duplicate listeners across the current provider files", () => {
    expect(verifyNoDuplicateListeners()).toEqual([]);
  });
});

describe("isCollectionQueryBounded (SPENDLY-415)", () => {
  it("is true when limit(...) sits near the collection() call", () => {
    const content = `query(collection(db, "users", uid, "categories"), limit(500))`;
    expect(isCollectionQueryBounded(content, "categories")).toBe(true);
  });

  it("is false when the collection() call has no nearby limit(...)", () => {
    const content = `query(collection(db, "users", uid, "categories"), orderBy("name"))`;
    expect(isCollectionQueryBounded(content, "categories")).toBe(false);
  });

  it("is true (not this check's concern) when the collection isn't present at all", () => {
    expect(isCollectionQueryBounded("export const x = 1;", "categories")).toBe(true);
  });
});

describe("verifyReferenceQueriesBounded (SPENDLY-415)", () => {
  it("finds zero un-bounded reference queries in the current codebase", () => {
    expect(verifyReferenceQueriesBounded()).toEqual([]);
  });
});

describe("verifyOnDemandGatingPresent (SPENDLY-415)", () => {
  it("finds every expected on-demand listener gate present in the current codebase", () => {
    expect(verifyOnDemandGatingPresent()).toEqual([]);
  });
});
