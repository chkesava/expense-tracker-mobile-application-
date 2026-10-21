import { describe, expect, it } from "vitest";

import {
  formatSignedPercent,
  investmentKindLabel,
  investmentReturnPercent,
  investmentStatusDisplay,
} from "./investmentPresentation";

describe("investmentKindLabel", () => {
  it("labels each kind", () => {
    expect(investmentKindLabel("fixed_deposit")).toBe("Fixed Deposit");
    expect(investmentKindLabel("interest_savings")).toBe("Interest Savings");
    expect(investmentKindLabel("mutual_fund")).toBe("Mutual Fund");
  });
});

describe("investmentReturnPercent", () => {
  it("is the gain as a share of principal", () => {
    expect(investmentReturnPercent(50, 1000)).toBeCloseTo(5);
    expect(investmentReturnPercent(-25, 1000)).toBeCloseTo(-2.5);
  });

  it("is null without principal", () => {
    expect(investmentReturnPercent(10, 0)).toBeNull();
    expect(investmentReturnPercent(10, -5)).toBeNull();
  });
});

describe("formatSignedPercent", () => {
  it("prefixes gains with + and losses with -", () => {
    expect(formatSignedPercent(3.24)).toBe("+3.2%");
    expect(formatSignedPercent(-1.55, 2)).toBe("-1.55%");
  });

  it("never shows a double sign for a loss", () => {
    // The old card printed `+${pct}%`, giving "+-3.2%" for a loss.
    expect(formatSignedPercent(-3.2)).toBe("-3.2%");
  });

  it("shows zero, and values that round to zero, unsigned", () => {
    expect(formatSignedPercent(0)).toBe("0.0%");
    expect(formatSignedPercent(-0.04)).toBe("0.0%");
  });
});

describe("investmentStatusDisplay", () => {
  it("keeps matured distinct from active and closed", () => {
    expect(investmentStatusDisplay("active")).toEqual({ label: "Active", tone: "positive" });
    expect(investmentStatusDisplay("matured")).toEqual({ label: "Matured", tone: "info" });
    expect(investmentStatusDisplay("closed")).toEqual({ label: "Closed", tone: "muted" });
  });
});
