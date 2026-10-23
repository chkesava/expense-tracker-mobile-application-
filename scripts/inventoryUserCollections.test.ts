import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  aggregateInventory,
  classifyCollection,
  formatReport,
  isDuressUserId,
  missingWaveCollections,
  runBlocker,
} = require("./inventory-user-collections.js");

describe("inventory-user-collections (SPENDLY-502)", () => {
  describe("runBlocker", () => {
    it("runs against a local emulator without a flag", () => {
      expect(runBlocker({ emulatorHost: "127.0.0.1:8080", production: false })).toBeNull();
      expect(runBlocker({ emulatorHost: "localhost:8080", production: false })).toBeNull();
    });

    it("refuses a non-local emulator host", () => {
      expect(runBlocker({ emulatorHost: "10.0.0.5:8080", production: false })).toMatch(/local emulator/);
    });

    it("refuses production without the explicit flag", () => {
      expect(runBlocker({ emulatorHost: undefined, production: false })).toMatch(/--production/);
    });

    it("refuses an ambiguous target", () => {
      expect(runBlocker({ emulatorHost: "127.0.0.1:8080", production: true })).toMatch(/cannot be combined/);
    });

    it("allows production only with the flag", () => {
      expect(runBlocker({ emulatorHost: undefined, production: true })).toBeNull();
    });
  });

  it("classifies collections into the SPENDLY-494 waves", () => {
    expect(classifyCollection("expenses")).toBe("wave1");
    expect(classifyCollection("categories")).toBe("wave1");
    expect(classifyCollection("borrowingRepayments")).toBe("wave2");
    expect(classifyCollection("holdings")).toBe("wave3");
    expect(classifyCollection("epfContributions")).toBe("wave3");
    expect(classifyCollection("meta")).toBe("excluded");
    expect(classifyCollection("financialSummaries")).toBe("excluded");
    expect(classifyCollection("focus")).toBe("unassigned");
  });

  it("recognises duress decoy trees", () => {
    expect(isDuressUserId("abc123_duress")).toBe(true);
    expect(isDuressUserId("abc123")).toBe(false);
  });

  it("aggregates without carrying identifiers", () => {
    const rows = aggregateInventory([
      { collections: [{ name: "expenses", docCount: 10 }, { name: "focus", docCount: 1 }] },
      { collections: [{ name: "expenses", docCount: 5 }, { name: "meta", docCount: 2 }] },
    ]);
    expect(rows).toEqual([
      { name: "expenses", bucket: "wave1", users: 2, docs: 15 },
      { name: "meta", bucket: "excluded", users: 1, docs: 2 },
      { name: "focus", bucket: "unassigned", users: 1, docs: 1 },
    ]);
  });

  it("leaves doc totals null when counts were not requested", () => {
    const rows = aggregateInventory([{ collections: [{ name: "expenses" }] }]);
    expect(rows[0].docs).toBeNull();
  });

  it("reports wave collections that no user has", () => {
    const rows = aggregateInventory([{ collections: [{ name: "expenses" }] }]);
    const missing = missingWaveCollections(rows);
    expect(missing).toContain("incomes");
    expect(missing).not.toContain("expenses");
  });

  it("formats a report that contains no uid", () => {
    const text = formatReport({
      target: "emulator 127.0.0.1:8080 (demo-spendly)",
      userCount: 1,
      duressCount: 1,
      failures: { "permission-denied": 1 },
      rows: aggregateInventory([{ collections: [{ name: "expenses", docCount: 3 }] }]),
      docCounts: true,
    });
    expect(text).toContain("expenses");
    expect(text).toContain("permission-denied=1");
    expect(text).toContain("No uids");
    expect(text).not.toContain("demo-spendly-user");
  });
});
