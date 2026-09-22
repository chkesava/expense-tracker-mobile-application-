import { describe, expect, it } from "vitest";

import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";
import {
  applyAccountActivityFilters,
  createEmptyAccountActivityFilters,
  enrichAccountActivities,
} from "./accountActivityFilters";
import {
  buildAccountActivitySearchText,
  searchAccountActivities,
} from "./accountActivitySearch";

/**
 * Newest-first, exactly as `buildAccountActivities()` hands the list over, with
 * running balances already resolved. The oldest row deliberately carries no
 * balance: it sits before the account's baseline date.
 */
const activities: AccountActivity[] = [
  {
    id: "transfer-out-7f3a91c2",
    date: "2026-09-06",
    amount: 12_500,
    type: "debit",
    linkedTransferId: "7f3a91c2",
    isTransfer: true,
    counterpartyName: "HDFC Savings",
    runningBalance: 18_400,
  },
  {
    id: "payment-in-4d20",
    date: "2026-09-05",
    amount: 250,
    type: "credit",
    linkedPaymentId: "4d20",
    isCashback: true,
    counterpartyName: "Axis Card",
    runningBalance: 30_900,
  },
  {
    id: "swiggy-refund",
    date: "2026-09-04",
    amount: 1_250,
    type: "credit",
    linkedIncomeId: "swiggy-refund",
    source: "Swiggy Refund",
    runningBalance: 30_650,
  },
  {
    id: "groceries",
    date: "2026-09-03",
    amount: 1_250,
    type: "debit",
    linkedExpenseId: "groceries",
    category: "Food & Groceries",
    note: "Weekly vegetables",
    runningBalance: 29_400,
  },
  {
    id: "bill-jio",
    date: "2026-09-02",
    amount: 799,
    type: "debit",
    linkedPaymentId: "bill-jio",
    isBillPayment: true,
    counterpartyName: "Jio Postpaid",
    runningBalance: 30_650,
  },
  {
    id: "pre-baseline",
    date: "2026-08-28",
    amount: 4_000,
    type: "debit",
    linkedExpenseId: "pre-baseline",
    category: "Travel & Holidays",
    note: "Ooty trip",
  },
];

const expenses: Expense[] = [
  {
    id: "groceries",
    amount: 1_250,
    category: "Food & Groceries",
    subcategory: "Vegetables",
    tags: ["home", "weekly"],
    note: "Weekly vegetables",
    date: "2026-09-03",
    month: "2026-09",
    accountId: "account-a",
    isAudited: true,
    createdAt: "2026-09-03",
  },
  {
    id: "pre-baseline",
    amount: 4_000,
    category: "Travel & Holidays",
    tags: ["trip"],
    note: "Ooty trip",
    date: "2026-08-28",
    month: "2026-08",
    accountId: "account-a",
    createdAt: "2026-08-28",
  },
];

const incomes: Income[] = [
  {
    id: "swiggy-refund",
    amount: 1_250,
    source: "Swiggy Refund",
    note: "Order cancelled",
    date: "2026-09-04",
    month: "2026-09",
    accountId: "account-a",
    createdAt: "2026-09-04",
  },
];

const entries: AccountEntry[] = [];

function records() {
  return enrichAccountActivities(activities, expenses, incomes, entries);
}

function idsFor(query: string): string[] {
  return searchAccountActivities(records(), query).map(
    (record) => record.activity.id
  );
}

describe("account activity search", () => {
  describe("text matching", () => {
    it("matches a note case-insensitively", () => {
      expect(idsFor("VEGETABLES")).toEqual(["groceries"]);
    });

    it("matches an income source", () => {
      expect(idsFor("swiggy")).toEqual(["swiggy-refund"]);
    });

    it("matches a category", () => {
      expect(idsFor("food &")).toEqual(["groceries"]);
    });

    it("matches a subcategory resolved from the linked expense", () => {
      expect(idsFor("Vegetables")).toEqual(["groceries"]);
    });

    it("matches a transfer counterparty account name", () => {
      expect(idsFor("hdfc savings")).toEqual(["transfer-out-7f3a91c2"]);
    });

    it("matches a tag from the linked expense", () => {
      expect(idsFor("weekly")).toEqual(["groceries"]);
    });

    it("matches the subtype label shown on the row", () => {
      expect(idsFor("cashback")).toEqual(["payment-in-4d20"]);
      expect(idsFor("bill payment")).toEqual(["bill-jio"]);
    });

    it("matches formatted date text as well as the ISO date", () => {
      expect(idsFor("2026-09-03")).toEqual(["groceries"]);
      expect(idsFor("28 Aug")).toEqual(["pre-baseline"]);
    });
  });

  describe("numeric matching", () => {
    it("treats plain, grouped and decimal amounts as the same value", () => {
      const expected = ["swiggy-refund", "groceries"];
      expect(idsFor("1250")).toEqual(expected);
      expect(idsFor("1,250")).toEqual(expected);
      expect(idsFor("1250.00")).toEqual(expected);
    });

    it("matches an amount that is not a whole rupee count", () => {
      expect(idsFor("799")).toEqual(["bill-jio"]);
    });
  });

  describe("reference id matching", () => {
    it("finds a row by a pasted raw document id segment", () => {
      expect(idsFor("7f3a91c2")).toEqual(["transfer-out-7f3a91c2"]);
    });

    it("finds a row by its full prefixed activity id", () => {
      expect(idsFor("transfer-out-7f3a91c2")).toEqual([
        "transfer-out-7f3a91c2",
      ]);
    });

    it("ignores id prefixes shorter than the threshold", () => {
      // "4d20" appears only inside an id, nowhere in any row's visible text,
      // so it isolates id matching from text matching. One character short of
      // the threshold it must stop matching rather than sweeping the ledger.
      expect(idsFor("4d20")).toEqual(["payment-in-4d20"]);
      expect(idsFor("4d2")).toEqual([]);
    });
  });

  describe("token handling", () => {
    it("requires every token to match", () => {
      expect(idsFor("swiggy refund")).toEqual(["swiggy-refund"]);
      expect(idsFor("swiggy groceries")).toEqual([]);
    });

    it("returns no records when nothing matches", () => {
      expect(idsFor("zzzz-no-such-thing")).toEqual([]);
    });

    it("returns the same array reference for an empty or blank query", () => {
      const input = records();
      expect(searchAccountActivities(input, "")).toBe(input);
      expect(searchAccountActivities(input, "   ")).toBe(input);
    });
  });

  describe("composition with filters", () => {
    it("narrows an already-filtered set", () => {
      const filters = {
        ...createEmptyAccountActivityFilters(),
        kind: "expense" as const,
      };
      const filtered = applyAccountActivityFilters(records(), filters);
      const searched = searchAccountActivities(filtered, "1250");
      expect(searched.map((record) => record.activity.id)).toEqual([
        "groceries",
      ]);
    });

    it("gives the same result when search runs before filters", () => {
      const filters = {
        ...createEmptyAccountActivityFilters(),
        kind: "expense" as const,
      };
      const searchedFirst = applyAccountActivityFilters(
        searchAccountActivities(records(), "1250"),
        filters
      );
      expect(searchedFirst.map((record) => record.activity.id)).toEqual([
        "groceries",
      ]);
    });
  });

  describe("ledger integrity", () => {
    it("preserves order and leaves running balances untouched", () => {
      const all = records();
      const searched = searchAccountActivities(all, "2026");
      expect(searched.map((record) => record.activity.id)).toEqual(
        all.map((record) => record.activity.id)
      );
      expect(searched.map((record) => record.activity.runningBalance)).toEqual([
        18_400, 30_900, 30_650, 29_400, 30_650, undefined,
      ]);
    });

    it("keeps a pre-baseline row's balance undefined when it matches", () => {
      const searched = searchAccountActivities(records(), "ooty");
      expect(searched).toHaveLength(1);
      expect(searched[0].activity.runningBalance).toBeUndefined();
    });

    it("returns the original record objects rather than copies", () => {
      const all = records();
      const searched = searchAccountActivities(all, "ooty");
      expect(searched[0]).toBe(all[all.length - 1]);
    });
  });

  describe("buildAccountActivitySearchText", () => {
    it("includes the fields a user can see on the row", () => {
      const groceries = records().find(
        (record) => record.activity.id === "groceries"
      );
      const text = buildAccountActivitySearchText(groceries!);
      expect(text).toContain("weekly vegetables");
      expect(text).toContain("food & groceries");
      expect(text).toContain("home");
      // Amounts are matched by value, never as substrings of the text.
      expect(text).not.toContain("1250");
    });

    it("keeps credit-card cashback distinct from a bill payment", () => {
      const all = records();
      const cashback = all.find(
        (record) => record.activity.id === "payment-in-4d20"
      );
      const bill = all.find((record) => record.activity.id === "bill-jio");
      expect(buildAccountActivitySearchText(cashback!)).toContain("cashback");
      expect(buildAccountActivitySearchText(cashback!)).not.toContain(
        "bill payment"
      );
      expect(buildAccountActivitySearchText(bill!)).toContain("bill payment");
    });
  });
});
