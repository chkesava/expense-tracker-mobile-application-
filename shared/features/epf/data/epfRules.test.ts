import { describe, expect, it } from "vitest";

import {
  EPF_CONTRIBUTION_RULES,
  findEpfContributionRule,
} from "@/shared/features/epf/data/epfRules";

describe("EPF_CONTRIBUTION_RULES table", () => {
  it("is ordered newest first", () => {
    for (let i = 1; i < EPF_CONTRIBUTION_RULES.length; i += 1) {
      expect(
        EPF_CONTRIBUTION_RULES[i].effectiveFrom < EPF_CONTRIBUTION_RULES[i - 1].effectiveFrom
      ).toBe(true);
    }
  });

  it("is contiguous — each slab ends exactly where the newer one begins", () => {
    for (let i = 1; i < EPF_CONTRIBUTION_RULES.length; i += 1) {
      expect(EPF_CONTRIBUTION_RULES[i].effectiveTo).toBe(
        EPF_CONTRIBUTION_RULES[i - 1].effectiveFrom
      );
    }
  });

  it("leaves the newest slab open-ended", () => {
    expect(EPF_CONTRIBUTION_RULES[0].effectiveTo).toBeUndefined();
  });

  it("uses unique ids", () => {
    const ids = EPF_CONTRIBUTION_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findEpfContributionRule", () => {
  it("returns the pre-2014 ceiling for August 2014", () => {
    const rule = findEpfContributionRule("2014-08");
    expect(rule.id).toBe("2001-06");
    expect(rule.wageCeiling).toBe(6500);
  });

  it("returns the raised ceiling from September 2014, the month it took effect", () => {
    const rule = findEpfContributionRule("2014-09");
    expect(rule.id).toBe("2014-09");
    expect(rule.wageCeiling).toBe(15000);
  });

  it("still returns the raised ceiling for a recent month", () => {
    expect(findEpfContributionRule("2026-01").wageCeiling).toBe(15000);
  });

  it("falls back to the oldest slab for a month before the table starts", () => {
    const rule = findEpfContributionRule("1990-01");
    expect(rule.id).toBe("2001-06");
  });

  it("never throws on a malformed month", () => {
    expect(() => findEpfContributionRule("")).not.toThrow();
  });
});
