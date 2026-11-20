import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOW_BALANCE_LEAD_DAYS,
  cardAutopay,
  isValidLeadDays,
  resolveLeadDays,
  subscriptionLeadDays,
} from "./lowBalanceAlerts";

describe("isValidLeadDays", () => {
  it("accepts whole days 0-15 only", () => {
    expect([0, 1, 3, 7, 15].every(isValidLeadDays)).toBe(true);
    expect([-1, 16, 2.5, NaN, "3", null, undefined].some(isValidLeadDays)).toBe(false);
  });
});

describe("resolveLeadDays", () => {
  it("prefers a valid override, then the default, then 3", () => {
    expect(resolveLeadDays(7, 5)).toBe(7);
    expect(resolveLeadDays(0, 5)).toBe(0);
    expect(resolveLeadDays(null, 5)).toBe(5);
    expect(resolveLeadDays(99, 5)).toBe(5);
    expect(resolveLeadDays(undefined, -2)).toBe(DEFAULT_LOW_BALANCE_LEAD_DAYS);
  });

  it("reads a subscription's override", () => {
    expect(subscriptionLeadDays({ lowBalanceLeadDays: 1 }, 3)).toBe(1);
    expect(subscriptionLeadDays({}, 5)).toBe(5);
  });
});

describe("cardAutopay", () => {
  it("is null without a paying account, or when it points at the card itself", () => {
    expect(cardAutopay({ id: "c1" }, 3)).toBeNull();
    expect(cardAutopay({ id: "c1", autopayFromAccountId: null }, 3)).toBeNull();
    expect(cardAutopay({ id: "c1", autopayFromAccountId: "" }, 3)).toBeNull();
    expect(cardAutopay({ id: "c1", autopayFromAccountId: "c1" }, 3)).toBeNull();
  });

  it("returns the link with mode and lead days", () => {
    expect(
      cardAutopay({ id: "c1", autopayFromAccountId: "b1", autopayAmountMode: "minimum", autopayLeadDays: 5 }, 3)
    ).toEqual({ fromAccountId: "b1", amountMode: "minimum", leadDays: 5 });
  });

  it("falls back to total and the default lead days", () => {
    expect(
      cardAutopay({ id: "c1", autopayFromAccountId: "b1", autopayAmountMode: null, autopayLeadDays: null }, 4)
    ).toEqual({ fromAccountId: "b1", amountMode: "total", leadDays: 4 });
  });
});
