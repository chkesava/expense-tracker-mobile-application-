import { describe, expect, it } from "vitest";

import { debtStatusTone, settledPercent } from "./debtPresentation";

describe("debtStatusTone", () => {
  it("maps every borrowing and receivable status", () => {
    expect(debtStatusTone("OVERDUE")).toBe("negative");
    expect(debtStatusTone("PARTIALLY_SETTLED")).toBe("warning");
    expect(debtStatusTone("FULLY_SETTLED")).toBe("positive");
    expect(debtStatusTone("ACTIVE")).toBe("accent");
    expect(debtStatusTone("CLOSED")).toBe("muted");
    expect(debtStatusTone("CANCELLED")).toBe("muted");
  });
});

describe("settledPercent", () => {
  it("clamps to 0–100 and survives a zero or missing total", () => {
    expect(settledPercent(25, 100)).toBe(25);
    expect(settledPercent(150, 100)).toBe(100);
    expect(settledPercent(-5, 100)).toBe(0);
    expect(settledPercent(10, 0)).toBe(0);
    expect(settledPercent(Number.NaN, 100)).toBe(0);
  });
});
