import { describe, expect, it } from "vitest";

import {
  emptySummaryAllocators,
  legacySummaryNeedsMerge,
  mergeSummaryAllocators,
  planSummaryAllocatorMerge,
} from "@/shared/utils/ganeshSummaryMigrate";
import { legacySummaryDoc, summaryDoc } from "@/shared/utils/ganeshPaths";

describe("summaryDoc path contract (KAN-36)", () => {
  it("points listeners and allocator writes at summary/totals", () => {
    expect(summaryDoc("p-1", "f-1")).toEqual([
      "pandals",
      "p-1",
      "festivals",
      "f-1",
      "summary",
      "totals",
    ]);
    expect(summaryDoc("p-1", "f-1").join("/")).not.toContain("current");
  });

  it("keeps the old current path only for repair", () => {
    expect(legacySummaryDoc("p-1", "f-1")).toEqual([
      "pandals",
      "p-1",
      "festivals",
      "f-1",
      "summary",
      "current",
    ]);
  });
});

describe("planSummaryAllocatorMerge", () => {
  it("copies current onto a missing totals document", () => {
    expect(
      planSummaryAllocatorMerge(null, { nextReceiptNumber: 18, nextContributionNumber: 4 })
    ).toEqual({ nextReceiptNumber: 18, nextContributionNumber: 4 });
  });

  it("keeps the higher allocator when both documents exist", () => {
    expect(
      planSummaryAllocatorMerge(
        { nextReceiptNumber: 10, nextContributionNumber: 7 },
        { nextReceiptNumber: 18, nextContributionNumber: 2 }
      )
    ).toEqual({ nextReceiptNumber: 18, nextContributionNumber: 7 });
  });

  it("is a no-op when totals already holds the higher numbers", () => {
    expect(
      planSummaryAllocatorMerge(
        { nextReceiptNumber: 18, nextContributionNumber: 7 },
        { nextReceiptNumber: 10, nextContributionNumber: 2 }
      )
    ).toBeNull();
  });

  it("does not invent a document when neither side exists", () => {
    expect(planSummaryAllocatorMerge(null, null)).toBeNull();
    expect(emptySummaryAllocators()).toEqual({
      nextReceiptNumber: 0,
      nextContributionNumber: 0,
    });
  });

  it("treats non-numeric allocators as zero rather than NaN", () => {
    expect(mergeSummaryAllocators({ nextReceiptNumber: "x" }, { nextReceiptNumber: 3 })).toEqual({
      nextReceiptNumber: 3,
      nextContributionNumber: 0,
    });
  });
});

describe("legacySummaryNeedsMerge", () => {
  it("is true only when current has something totals lacks", () => {
    expect(legacySummaryNeedsMerge(null, { nextReceiptNumber: 1 })).toBe(true);
    expect(
      legacySummaryNeedsMerge({ nextReceiptNumber: 1 }, { nextReceiptNumber: 2 })
    ).toBe(true);
    expect(
      legacySummaryNeedsMerge({ nextReceiptNumber: 2 }, { nextReceiptNumber: 1 })
    ).toBe(false);
    expect(legacySummaryNeedsMerge({ nextReceiptNumber: 1 }, null)).toBe(false);
  });
});
