import { describe, expect, it } from "vitest";
import {
  findOnSnapshotCollections,
  findOnSnapshotCollectionsResolved,
  isCollectionQueryBounded,
  verifyNoDuplicateListeners,
  verifyNoProviderCollectionRelisten,
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

describe("findOnSnapshotCollectionsResolved (SPENDLY-501)", () => {
  it("follows a collection held in a variable through a query variable", () => {
    const content = `
      const ref = collection(db, "users", uid, "expenses");
      const q = query(ref, orderBy("date", "desc"), limit(5));
      const unsubscribe = onSnapshot(q, () => {});`;
    expect([...findOnSnapshotCollectionsResolved(content)]).toEqual(["expenses"]);
  });

  it("follows an inline query over a collection variable", () => {
    const content = `
      const expensesCol = collection(db, ...base, "expenses");
      onSnapshot(query(expensesCol, limit(300)), () => {});`;
    expect([...findOnSnapshotCollectionsResolved(content)]).toEqual(["expenses"]);
  });

  it("ignores a collection variable that is only read once", () => {
    const content = `
      const ref = collection(db, "users", uid, "expenses");
      await getDocs(ref);
      onSnapshot(doc(db, "users", uid), () => {});`;
    expect([...findOnSnapshotCollectionsResolved(content)]).toEqual([]);
  });
});

describe("verifyNoProviderCollectionRelisten (SPENDLY-501)", () => {
  it("finds no hook, screen or component re-subscribing to a provider collection", () => {
    expect(verifyNoProviderCollectionRelisten()).toEqual([]);
  });
});
