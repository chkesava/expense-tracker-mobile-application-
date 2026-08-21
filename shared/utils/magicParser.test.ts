import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNaturalLanguageTransaction } from "./magicParser";

describe("parseNaturalLanguageTransaction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const mockAccounts = [
    { id: "acc_hdfc", name: "HDFC" },
    { id: "acc_sbi", name: "SBI" },
    { id: "acc_cash", name: "Cash" },
  ];

  const mockRules = [
    {
      id: "rule_1",
      keyword: "swiggy",
      category: "Food & Dining",
      subcategory: "Food Delivery",
      createdAt: 1000,
    },
  ];

  it("parses basic expense with amount and category", () => {
    const res = parseNaturalLanguageTransaction("Spent 450 on groceries", {
      accounts: mockAccounts,
    });
    expect(res.type).toBe("expense");
    expect(res.amount).toBe(450);
    expect(res.category).toBe("Food & Dining");
    expect(res.subcategory).toBe("Groceries");
  });

  it("parses account name and relative date", () => {
    // The parser resolves "yesterday" against the *local* calendar day. Freeze
    // local noon so the expected key is a literal in any timezone — building it
    // from `toISOString()` compares a local date to a UTC one and fails for
    // every hour of the day that straddles the UTC date boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0)); // 20 Aug 2026, local noon

    const res = parseNaturalLanguageTransaction(
      "Paid 1200 for electricity bill yesterday with HDFC",
      { accounts: mockAccounts }
    );
    expect(res.type).toBe("expense");
    expect(res.amount).toBe(1200);
    expect(res.accountId).toBe("acc_hdfc");
    expect(res.accountName).toBe("HDFC");
    expect(res.date).toBe("2026-08-19");
  });

  it("resolves today and day-before-yesterday on the local calendar too", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 1, 23, 30, 0)); // 1 Mar 2026, late local

    expect(
      parseNaturalLanguageTransaction("Spent 100 on coffee today", {
        accounts: mockAccounts,
      }).date
    ).toBe("2026-03-01");

    expect(
      parseNaturalLanguageTransaction(
        "Spent 100 on coffee day before yesterday",
        { accounts: mockAccounts }
      ).date
      // 1 Mar minus two days crosses a month boundary into a 28-day February.
    ).toBe("2026-02-27");
  });

  it("parses k notation amounts (e.g. 5k, 50k)", () => {
    const res = parseNaturalLanguageTransaction("50k salary received today in SBI", {
      accounts: mockAccounts,
    });
    expect(res.type).toBe("income");
    expect(res.amount).toBe(50000);
    expect(res.accountId).toBe("acc_sbi");
  });

  it("applies user categorization rules with priority", () => {
    const res = parseNaturalLanguageTransaction("Dinner order on swiggy 620 rs", {
      accounts: mockAccounts,
      rules: mockRules,
    });
    expect(res.type).toBe("expense");
    expect(res.amount).toBe(620);
    expect(res.category).toBe("Food & Dining");
    expect(res.subcategory).toBe("Food Delivery");
  });

  it("extracts clean note without leftover tokens", () => {
    const res = parseNaturalLanguageTransaction("Coffee at Starbucks 250 rs with Cash", {
      accounts: mockAccounts,
    });
    expect(res.amount).toBe(250);
    expect(res.accountId).toBe("acc_cash");
    expect(res.note).toContain("Starbucks");
  });
});
