import { describe, expect, it } from "vitest";

import type { CreditCardBillStatus } from "../types/creditCardBill";
import { billStatusPresentation, creditUtilizationBand } from "./creditCardPresentation";

describe("creditUtilizationBand", () => {
  it("keeps the 30% / 70% boundaries", () => {
    expect(creditUtilizationBand(0).level).toBe("low");
    expect(creditUtilizationBand(30).level).toBe("low");
    expect(creditUtilizationBand(30.1).level).toBe("moderate");
    expect(creditUtilizationBand(70).level).toBe("moderate");
    expect(creditUtilizationBand(70.1)).toEqual({ level: "high", word: "High", tone: "negative" });
  });
});

describe("billStatusPresentation", () => {
  it("gives every known status a word, never just a colour", () => {
    const statuses: CreditCardBillStatus[] = [
      "UPCOMING",
      "DUE_SOON",
      "DUE_TODAY",
      "OVERDUE",
      "PARTIALLY_PAID",
      "PAID",
    ];
    for (const status of statuses) {
      expect(billStatusPresentation(status).word).toMatch(/^[A-Z][a-z]/);
    }
    expect(billStatusPresentation("OVERDUE")).toEqual({ word: "Overdue", tone: "negative" });
    expect(billStatusPresentation("DUE_TODAY").tone).toBe("warning");
  });

  it("humanises statuses it does not know", () => {
    expect(billStatusPresentation("CANCELLED" as CreditCardBillStatus)).toEqual({
      word: "Cancelled",
      tone: "muted",
    });
  });
});
