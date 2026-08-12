import { describe, expect, it } from "vitest";
import { LARGE_EXPENSE_THRESHOLD, shouldSuggestSplit } from "./proactiveSplits";

describe("proactiveSplits", () => {
  it("suggests split for large amounts", () => {
    expect(shouldSuggestSplit(LARGE_EXPENSE_THRESHOLD, "coffee")).toBe(true);
    expect(shouldSuggestSplit(LARGE_EXPENSE_THRESHOLD - 1, "coffee")).toBe(false);
  });

  it("suggests split when note contains group keywords (case-insensitive)", () => {
    expect(shouldSuggestSplit(100, "Team Dinner outing")).toBe(true);
    expect(shouldSuggestSplit(100, "WEEKEND trip")).toBe(true);
    expect(shouldSuggestSplit(100, "Solo commute")).toBe(false);
  });
});
