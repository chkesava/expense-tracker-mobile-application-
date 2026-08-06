import { describe, expect, it } from "vitest";
import { parseNaturalLanguageTransaction } from "./magicParser";

describe("parseNaturalLanguageTransaction", () => {
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
    const res = parseNaturalLanguageTransaction(
      "Paid 1200 for electricity bill yesterday with HDFC",
      { accounts: mockAccounts }
    );
    expect(res.type).toBe("expense");
    expect(res.amount).toBe(1200);
    expect(res.accountId).toBe("acc_hdfc");
    expect(res.accountName).toBe("HDFC");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    expect(res.date).toBe(yStr);
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
