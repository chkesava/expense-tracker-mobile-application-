import { describe, expect, it } from "vitest";
import {
  MAX_UNBILLED_PERCENT,
  validateUnbilledSpend,
} from "./creditCardLedger";

describe("validateUnbilledSpend", () => {
  it("passes when unbilled spend is under the threshold", () => {
    expect(() => validateUnbilledSpend(100000, 70000)).not.toThrow();
  });

  it("passes when unbilled spend is exactly at the threshold", () => {
    expect(() => validateUnbilledSpend(100000, 80000)).not.toThrow();
  });

  it("throws when unbilled spend exceeds the threshold", () => {
    expect(() => validateUnbilledSpend(100000, 85000)).toThrow(
      /exceeds 80% of credit limit/
    );
  });

  it("passes when limit is 0 and spend is 0", () => {
    expect(() => validateUnbilledSpend(0, 0)).not.toThrow();
  });

  it("throws when limit is 0 but spend is positive", () => {
    expect(() => validateUnbilledSpend(0, 100)).toThrow(
      /exceeds 80% of credit limit/
    );
  });

  it("passes when spend is 0 regardless of limit", () => {
    expect(() => validateUnbilledSpend(50000, 0)).not.toThrow();
  });

  it("exports MAX_UNBILLED_PERCENT as 0.8", () => {
    expect(MAX_UNBILLED_PERCENT).toBe(0.8);
  });
});
