import { describe, expect, it } from "vitest";

import { runMerchantQa } from "./merchantQa";

describe("merchant QA fixture", () => {
  it("is repeatable and retains negative cases", () => {
    const first = runMerchantQa();
    const second = runMerchantQa();
    expect(first).toEqual(second);
    expect(first.fixtureCount).toBeGreaterThanOrEqual(8);
    expect(first.falsePositiveCount).toBe(0);
    expect(first.unknownCount).toBeGreaterThan(0);
  });
});
