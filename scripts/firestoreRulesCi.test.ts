import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertIndexDeploySafe,
  assertNoRulesCompilerWarnings,
  diffIndexes,
  diffRulesSource,
  extractJsonObject,
  formatIndexDiff,
  normalizeRulesSource,
} = require("./firestoreRulesCi.js");

const expensesByDate = {
  collectionGroup: "expenses",
  queryScope: "COLLECTION",
  fields: [
    { fieldPath: "spaceId", order: "ASCENDING" },
    { fieldPath: "date", order: "DESCENDING" },
  ],
};

const borrowingsByStatus = {
  collectionGroup: "borrowings",
  queryScope: "COLLECTION",
  fields: [
    { fieldPath: "status", order: "ASCENDING" },
    { fieldPath: "borrowedDate", order: "DESCENDING" },
    { fieldPath: "__name__", order: "DESCENDING" },
  ],
};

describe("assertNoRulesCompilerWarnings", () => {
  it("accepts a clean deploy log", () => {
    expect(() =>
      assertNoRulesCompilerWarnings("✔  firestore: rules compiled successfully\nDeploy complete")
    ).not.toThrow();
  });

  it("fails on a compiler [W] line", () => {
    expect(() =>
      assertNoRulesCompilerWarnings(
        "✔  compiled\n[W] 44:5 - Unused function isSuperAdmin.\nDeploy complete"
      )
    ).toThrow(/compiler warnings are fatal/i);
  });
});

describe("diffIndexes", () => {
  it("treats live extras as a delete risk even when the dump adds __name__", () => {
    const repo = { indexes: [expensesByDate], fieldOverrides: [] };
    const live = {
      indexes: [
        expensesByDate,
        borrowingsByStatus,
      ],
      fieldOverrides: [],
    };
    const diff = diffIndexes(repo, live);
    expect(diff.wouldDeleteLiveIndexes).toBe(true);
    expect(diff.missingFromRepo).toHaveLength(1);
    expect(diff.missingFromRepo[0].collectionGroup).toBe("borrowings");
    expect(diff.identical).toBe(false);
  });

  it("allows a deploy that only creates repo-only indexes", () => {
    const repo = { indexes: [expensesByDate, borrowingsByStatus], fieldOverrides: [] };
    const live = { indexes: [expensesByDate], fieldOverrides: [] };
    const diff = diffIndexes(repo, live);
    expect(diff.wouldDeleteLiveIndexes).toBe(false);
    expect(diff.extraInRepo).toHaveLength(1);
    expect(() => assertIndexDeploySafe(diff)).not.toThrow();
  });

  it("refuses a deploy that would delete live indexes", () => {
    const diff = diffIndexes(
      { indexes: [], fieldOverrides: [] },
      { indexes: [expensesByDate], fieldOverrides: [] }
    );
    expect(() => assertIndexDeploySafe(diff)).toThrow(/Refusing firestore:indexes deploy/i);
  });

  it("matches fieldOverrides by collectionGroup + fieldPath", () => {
    const override = {
      collectionGroup: "epfEstablishments",
      fieldPath: "employmentStatus",
      indexes: [
        { order: "ASCENDING", queryScope: "COLLECTION_GROUP" },
        { order: "ASCENDING", queryScope: "COLLECTION" },
      ],
    };
    const diff = diffIndexes(
      { indexes: [], fieldOverrides: [override] },
      { indexes: [], fieldOverrides: [override] }
    );
    expect(diff.identical).toBe(true);
  });

  it("parses CLI chatter around the JSON dump", () => {
    const parsed = extractJsonObject(
      "i  firestore: fetching indexes...\n{\"indexes\":[],\"fieldOverrides\":[]}\n"
    );
    expect(parsed.indexes).toEqual([]);
  });

  it("explains the delete risk in the report", () => {
    const report = formatIndexDiff(
      diffIndexes(
        { indexes: [], fieldOverrides: [] },
        { indexes: [expensesByDate], fieldOverrides: [] }
      )
    );
    expect(report).toMatch(/DELETES these/i);
    expect(report).toMatch(/expenses/);
  });
});

describe("diffRulesSource", () => {
  it("ignores CRLF and trailing whitespace", () => {
    const repo = "rules_version = '2';\r\n\r\nservice cloud.firestore {}\r\n";
    const live = "rules_version = '2';\n\nservice cloud.firestore {}\n";
    expect(diffRulesSource(repo, live).identical).toBe(true);
    expect(normalizeRulesSource(repo)).toBe(normalizeRulesSource(live));
  });

  it("detects a live file that is behind the repo", () => {
    const diff = diffRulesSource("allow read: if false;\n", "allow read: if true;\n");
    expect(diff.identical).toBe(false);
  });
});
