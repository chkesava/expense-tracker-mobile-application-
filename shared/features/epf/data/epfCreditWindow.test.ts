import { describe, expect, it } from "vitest";

import {
  EPF_CREDIT_WINDOW_RULES,
  findEpfCreditWindowRule,
} from "@/shared/features/epf/data/epfCreditWindow";

describe("EPF_CREDIT_WINDOW_RULES table", () => {
  it("leaves the newest rule open-ended", () => {
    expect(EPF_CREDIT_WINDOW_RULES[0].effectiveTo).toBeUndefined();
  });

  it("orders newest first", () => {
    for (let i = 1; i < EPF_CREDIT_WINDOW_RULES.length; i += 1) {
      expect(
        EPF_CREDIT_WINDOW_RULES[i].effectiveFrom < EPF_CREDIT_WINDOW_RULES[i - 1].effectiveFrom
      ).toBe(true);
    }
  });

  it("never opens the window after it closes", () => {
    for (const rule of EPF_CREDIT_WINDOW_RULES) {
      expect(rule.dayFrom).toBeLessThanOrEqual(rule.dayTo);
    }
  });

  it("keeps every day within a month", () => {
    for (const rule of EPF_CREDIT_WINDOW_RULES) {
      expect(rule.dayFrom).toBeGreaterThanOrEqual(1);
      expect(rule.dayTo).toBeLessThanOrEqual(31);
    }
  });
});

describe("findEpfCreditWindowRule", () => {
  it("resolves a recent month to the current rule", () => {
    expect(findEpfCreditWindowRule("2026-08").id).toBe("default");
  });

  it("falls back to the oldest rule for a month before the table starts", () => {
    expect(findEpfCreditWindowRule("1990-01").id).toBe("default");
  });

  it("never throws on a malformed month", () => {
    expect(() => findEpfCreditWindowRule("")).not.toThrow();
  });
});
