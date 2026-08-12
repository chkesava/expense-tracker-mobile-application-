import { describe, expect, it } from "vitest";

import {
  detectRecurringPatterns,
  matchesExistingSubscription,
  merchantFromExpense,
  patternToSubscription,
  recurringPatternKey,
  type RecurringExpenseInput,
} from "@/services/sms/smsRecurringDetector";

function netflix(date: string): RecurringExpenseInput {
  return {
    amount: 649,
    date,
    note: "Netflix · UPI · HDFC",
    category: "Entertainment",
    subcategory: "OTT",
  };
}

describe("merchantFromExpense", () => {
  it("uses the catalog name from an SMS note", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "Netflix · UPI · HDFC",
        category: "Entertainment",
      })
    ).toBe("Netflix");
  });

  it("prefers merchantHint", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "UPI debit",
        category: "Entertainment",
        merchantHint: "NETFLIXIN",
      })
    ).toBe("Netflix");
  });

  it("skips processor-generated notes and linked expenses", () => {
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "[Subscription] Netflix 4K",
        category: "Entertainment",
      })
    ).toBeNull();
    expect(
      merchantFromExpense({
        amount: 649,
        date: "2026-08-12",
        note: "Netflix",
        category: "Entertainment",
        subscriptionId: "sub-1",
      })
    ).toBeNull();
  });
});

describe("detectRecurringPatterns", () => {
  it("detects Netflix at ₹649 across four months", () => {
    const patterns = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
      netflix("2026-08-12"),
    ]);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.merchant).toBe("Netflix");
    expect(patterns[0]?.amount).toBe(649);
    expect(patterns[0]?.occurrences).toBe(4);
    expect(patterns[0]?.dayOfMonth).toBe(12);
    expect(patterns[0]?.category).toBe("Entertainment");
  });

  it("ignores the same amount three times in one week", () => {
    const patterns = detectRecurringPatterns([
      {
        amount: 450,
        date: "2026-08-10",
        note: "Swiggy",
        category: "Food & Dining",
      },
      {
        amount: 450,
        date: "2026-08-11",
        note: "Swiggy",
        category: "Food & Dining",
      },
      {
        amount: 450,
        date: "2026-08-12",
        note: "Swiggy",
        category: "Food & Dining",
      },
    ]);
    expect(patterns).toHaveLength(0);
  });

  it("needs at least three occurrences", () => {
    expect(
      detectRecurringPatterns([
        netflix("2026-06-12"),
        netflix("2026-07-12"),
      ])
    ).toHaveLength(0);
  });

  it("dedupes the same merchant+amount+date", () => {
    const patterns = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ]);
    expect(patterns[0]?.occurrences).toBe(3);
  });
});

describe("subscription matching", () => {
  it("matches an existing Netflix subscription", () => {
    const pattern = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ])[0]!;
    expect(
      matchesExistingSubscription(
        { name: "Netflix 4K", amount: 649 },
        pattern
      )
    ).toBe(true);
    expect(
      matchesExistingSubscription({ name: "Netflix", amount: 649 }, pattern)
    ).toBe(true);
    expect(recurringPatternKey("Netflix", 649)).toBe(
      recurringPatternKey("NETFLIXIN", 649)
    );
  });

  it("builds an SMS-sourced subscription payload", () => {
    const pattern = detectRecurringPatterns([
      netflix("2026-05-12"),
      netflix("2026-06-12"),
      netflix("2026-07-12"),
    ])[0]!;
    const sub = patternToSubscription(pattern);
    expect(sub.name).toBe("Netflix");
    expect(sub.amount).toBe(649);
    expect(sub.source).toBe("sms");
    expect(sub.type).toBe("subscription");
    expect(sub.lastProcessed).toBe("2026-07");
    expect(sub.isActive).toBe(true);
  });
});
