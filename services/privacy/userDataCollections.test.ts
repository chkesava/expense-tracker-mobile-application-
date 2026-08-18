import { describe, expect, it } from "vitest";

import {
  SENSITIVE_USER_FIELD_KEYS,
  USER_NESTED_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from "./userDataCollections";

describe("user data collection inventory", () => {
  it("covers ledger, nutrition, portfolio, and SIP collections", () => {
    expect(USER_SUBCOLLECTIONS).toEqual(
      expect.arrayContaining([
        "expenses",
        "incomes",
        "accounts",
        "weight_history",
        "profile",
        "sipPlans",
        "holdings",
        "creditCardBills",
      ])
    );
  });

  it("deletes nested daily log meals", () => {
    expect(USER_NESTED_COLLECTIONS).toContainEqual({
      collection: "daily_logs",
      nested: "meals",
    });
  });

  it("lists PIN fields to omit from access exports", () => {
    expect(SENSITIVE_USER_FIELD_KEYS).toEqual(["privacyPin", "fakePin"]);
  });
});
