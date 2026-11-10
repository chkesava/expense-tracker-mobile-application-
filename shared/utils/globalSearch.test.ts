import { describe, expect, it } from "vitest";
import {
  addRecentSearch,
  amountMatchesToken,
  normalizeSearchTerm,
  removeRecentSearch,
  searchGlobalItems,
  tokenizeSearchQuery,
  type GlobalSearchContext,
} from "./globalSearch";

describe("globalSearch", () => {
  describe("tokenization and normalization", () => {
    it("normalizes and trims queries", () => {
      expect(normalizeSearchTerm("  Swiggy  ")).toBe("swiggy");
    });

    it("tokenizes whitespace-separated terms", () => {
      expect(tokenizeSearchQuery("  swiggy   lunch  ")).toEqual(["swiggy", "lunch"]);
      expect(tokenizeSearchQuery("")).toEqual([]);
    });

    it("matches numeric amounts by token, including negative balances", () => {
      expect(amountMatchesToken(150, "150")).toBe(true);
      expect(amountMatchesToken(150.5, "150.50")).toBe(true);
      expect(amountMatchesToken(1250, "1,250")).toBe(true);
      expect(amountMatchesToken(500, "₹500")).toBe(true);
      expect(amountMatchesToken(-12000, "12000")).toBe(true);
      expect(amountMatchesToken(-12000, "12,000")).toBe(true);
      expect(amountMatchesToken(-500, "₹500")).toBe(true);
      expect(amountMatchesToken(500, "501")).toBe(false);
      expect(amountMatchesToken(500, "abc")).toBe(false);
    });
  });

  describe("searchGlobalItems", () => {
    const mockContext: GlobalSearchContext = {
      currentMonth: "2026-11",
      actions: [
        { id: "add_expense", title: "Add Expense", subtitle: "Record an expense", keywords: ["spend", "transaction"] },
        { id: "transfer", title: "Transfer", subtitle: "Move money between accounts", keywords: ["move", "wire"] },
      ],
      screens: [
        { id: "ledger", title: "Journal", subtitle: "Ledger", href: "/ledger", keywords: ["money", "transactions"] },
        { id: "insights", title: "Insights & Lab", subtitle: "Analytics", href: "/insights", keywords: ["reports", "charts"] },
        { id: "settings_privacy", title: "Settings › Privacy", subtitle: "App security", href: "/settings/privacy", keywords: ["ghost mode", "pin"] },
      ],
      accounts: [
        { id: "acc-hdfc", name: "HDFC Salary", institution: "HDFC Bank", balance: 50000, currency: "INR" },
        { id: "acc-icici", name: "ICICI Sapphiro", institution: "ICICI Bank", type: "Credit Card", balance: -12000, currency: "INR" },
      ],
      categories: [
        { name: "Food & Dining", subcategories: ["Groceries", "Restaurants", "Coffee"] },
        { name: "Utilities", subcategories: ["Electricity", "Internet", "Water"] },
      ],
      merchants: [
        { id: "swiggy", name: "Swiggy", count: 15, totalAmount: 4500, currency: "INR" },
        { id: "netflix", name: "Netflix", count: 6, totalAmount: 3900, currency: "INR" },
      ],
      transactions: [
        {
          id: "tx-1",
          kind: "expense",
          amount: 450,
          date: "2026-11-05",
          merchant: "Swiggy",
          category: "Food & Dining",
          subcategory: "Restaurants",
          note: "Biryani with team",
          accountName: "HDFC Salary",
          accountId: "acc-hdfc",
          tags: ["lunch", "work"],
        },
        {
          id: "tx-2",
          kind: "expense",
          amount: 650,
          date: "2026-11-04",
          merchant: "Netflix",
          category: "Entertainment",
          note: "Monthly subscription",
          accountName: "ICICI Sapphiro",
          accountId: "acc-icici",
        },
        {
          id: "tx-3",
          kind: "income",
          amount: 75000,
          date: "2026-11-01",
          category: "Salary",
          note: "Monthly salary",
          accountName: "HDFC Salary",
          accountId: "acc-hdfc",
        },
      ],
      recurring: [
        { id: "rec-netflix", name: "Netflix Subscription", amount: 650, currency: "INR", nextDate: "2026-12-04" },
      ],
      goals: [
        { id: "goal-macbook", name: "MacBook Pro", targetAmount: 200000, currentAmount: 80000, currency: "INR" },
      ],
    };

    it("returns empty groups when query is empty or whitespace", () => {
      const result = searchGlobalItems("   ", mockContext);
      expect(result.groups).toHaveLength(0);
      expect(result.totalMatches).toBe(0);
      expect(result.totalTransactionMatches).toBe(0);
    });

    it("matches actions and screens by keyword", () => {
      const result = searchGlobalItems("ghost mode", mockContext);
      const screenGroup = result.groups.find((g) => g.kind === "screen");
      expect(screenGroup).toBeDefined();
      expect(screenGroup?.items[0].title).toBe("Settings › Privacy");
      expect(screenGroup?.items[0].href).toBe("/settings/privacy");
    });

    it("matches accounts by name and institution", () => {
      const result = searchGlobalItems("sapphiro", mockContext);
      const accGroup = result.groups.find((g) => g.kind === "account");
      expect(accGroup).toBeDefined();
      expect(accGroup?.items[0].title).toBe("ICICI Sapphiro");
      expect(accGroup?.items[0].href).toBe("/accounts/acc-icici");
    });

    it("matches accounts with negative balances by positive magnitude", () => {
      const result = searchGlobalItems("12000", mockContext);
      const accGroup = result.groups.find((g) => g.kind === "account");
      expect(accGroup).toBeDefined();
      expect(accGroup?.items[0].title).toBe("ICICI Sapphiro");
    });

    it("matches categories and subcategories with deep-link hrefs", () => {
      const result = searchGlobalItems("groceries", mockContext);
      const catGroup = result.groups.find((g) => g.kind === "category");
      expect(catGroup).toBeDefined();
      expect(catGroup?.items[0].title).toBe("Groceries");
      expect(catGroup?.items[0].href).toContain("/spending/Food%20%26%20Dining/Groceries");
    });

    it("matches merchants with direct profile href", () => {
      const result = searchGlobalItems("swiggy", mockContext);
      const merchGroup = result.groups.find((g) => g.kind === "merchant");
      expect(merchGroup).toBeDefined();
      expect(merchGroup?.items[0].title).toBe("Swiggy");
      expect(merchGroup?.items[0].href).toBe("/merchants/swiggy");
    });

    it("matches transactions by note, tag, amount, and merchant", () => {
      // By note
      const byNote = searchGlobalItems("biryani", mockContext);
      const txGroupNote = byNote.groups.find((g) => g.kind === "transaction");
      expect(txGroupNote?.items[0].id).toBe("tx-tx-1");
      expect(txGroupNote?.items[0].title).toBe("Swiggy");

      // By tag
      const byTag = searchGlobalItems("lunch", mockContext);
      const txGroupTag = byTag.groups.find((g) => g.kind === "transaction");
      expect(txGroupTag?.items[0].id).toBe("tx-tx-1");

      // By amount
      const byAmount = searchGlobalItems("450", mockContext);
      const txGroupAmount = byAmount.groups.find((g) => g.kind === "transaction");
      expect(txGroupAmount?.items[0].id).toBe("tx-tx-1");
    });

    it("narrows multi-token queries so all tokens must match", () => {
      const match = searchGlobalItems("swiggy biryani", mockContext);
      expect(match.totalTransactionMatches).toBe(1);

      const noMatch = searchGlobalItems("swiggy netflix", mockContext);
      expect(noMatch.totalTransactionMatches).toBe(0);
    });

    it("matches recurring bills and goals", () => {
      const recResult = searchGlobalItems("netflix subscription", mockContext);
      const recGroup = recResult.groups.find((g) => g.kind === "recurring");
      expect(recGroup?.items[0].title).toBe("Netflix Subscription");

      const goalResult = searchGlobalItems("macbook", mockContext);
      const goalGroup = goalResult.groups.find((g) => g.kind === "goal");
      expect(goalGroup?.items[0].title).toBe("MacBook Pro");
      expect(goalGroup?.items[0].subtitle).toBe("Save Goal");
    });

    it("ranks exact matches higher than partial matches", () => {
      const ctx: GlobalSearchContext = {
        screens: [
          { id: "s1", title: "Ledger Details", href: "/ledger/details" },
          { id: "s2", title: "Ledger", href: "/ledger" },
        ],
      };
      const result = searchGlobalItems("ledger", ctx);
      expect(result.groups[0].items[0].title).toBe("Ledger");
      expect(result.groups[0].items[1].title).toBe("Ledger Details");
    });

    it("respects custom group limits", () => {
      const ctx: GlobalSearchContext = {
        screens: [
          { id: "1", title: "Item 1", href: "/1" },
          { id: "2", title: "Item 2", href: "/2" },
          { id: "3", title: "Item 3", href: "/3" },
        ],
      };
      const result = searchGlobalItems("item", ctx, { groupLimits: { screen: 2 } });
      expect(result.groups[0].items).toHaveLength(2);
      expect(result.totalMatches).toBe(3);
    });
  });

  describe("recent searches helper", () => {
    it("adds new search at the start", () => {
      const list = addRecentSearch(["Coffee", "Uber"], "Swiggy");
      expect(list).toEqual(["Swiggy", "Coffee", "Uber"]);
    });

    it("deduplicates existing search case-insensitively and brings to top", () => {
      const list = addRecentSearch(["Coffee", "Uber", "Swiggy"], "coffee");
      expect(list).toEqual(["coffee", "Uber", "Swiggy"]);
    });

    it("respects max limit", () => {
      const list = addRecentSearch(["1", "2", "3"], "4", 3);
      expect(list).toEqual(["4", "1", "2"]);
    });

    it("ignores empty or whitespace terms", () => {
      const list = addRecentSearch(["Coffee"], "   ");
      expect(list).toEqual(["Coffee"]);
    });

    it("removes search case-insensitively", () => {
      const list = removeRecentSearch(["Coffee", "Uber", "Swiggy"], "uber");
      expect(list).toEqual(["Coffee", "Swiggy"]);
    });
  });
});
