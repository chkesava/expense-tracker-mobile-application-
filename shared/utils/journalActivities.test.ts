import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "@/shared/types/expense";
import {
  applyAccountActivityFilters,
  createEmptyAccountActivityFilters,
  enrichAccountActivities,
} from "./accountActivityFilters";
import { buildAccountActivitySearchText } from "./accountActivitySearch";
import {
  buildJournalRecords,
  journalRecordsToRows,
  type JournalRecord,
} from "./journalActivities";

const accounts = [
  { id: "acc-hdfc", name: "HDFC", displayName: "HDFC Savings" },
  { id: "acc-icici", name: "ICICI Current", displayName: "" },
] as Pick<Account, "id" | "name" | "displayName">[];

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    amount: 500,
    category: "Food & Groceries",
    note: "Swiggy dinner",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-hdfc",
    createdAt: null,
    ...over,
  } as Expense;
}

function income(over: Partial<Income> = {}): Income {
  return {
    id: "i1",
    amount: 90_000,
    source: "Acme Payroll",
    note: "September salary",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "acc-icici",
    createdAt: null,
    ...over,
  } as Income;
}

describe("journal records (SPENDLY-109)", () => {
  describe("no double counting", () => {
    it("emits exactly one record per expense and per income", () => {
      const expenses = [expense({ id: "a" }), expense({ id: "b" })];
      const incomes = [income({ id: "c" })];
      const records = buildJournalRecords(expenses, incomes, accounts);

      expect(records).toHaveLength(expenses.length + incomes.length);
      expect(records.map((r) => r.activity.id).sort()).toEqual(["a", "b", "c"]);
    });

    it("never synthesizes a transfer, payment, borrowing or receivable leg", () => {
      // The builder takes no payments/entries/transfers parameters at all, so
      // the legs that would double-count a movement cannot exist. This pins
      // that as behaviour rather than an implementation detail.
      const records = buildJournalRecords(
        [expense({ id: "a", creditCardBillId: "bill-1" })],
        [income({ id: "b" })],
        accounts
      );

      for (const record of records) {
        expect(record.activity.isTransfer).toBeUndefined();
        expect(record.activity.isBillPayment).toBeUndefined();
        expect(record.activity.isBorrowing).toBeUndefined();
        expect(record.activity.isReceivable).toBeUndefined();
        expect(record.activity.linkedPaymentId).toBeUndefined();
        expect(record.activity.linkedTransferId).toBeUndefined();
        expect(record.activity.linkedAccountEntryId).toBeUndefined();
        expect(record.activity.linkedBorrowingId).toBeUndefined();
        expect(record.activity.linkedReceivableId).toBeUndefined();
      }
      expect(
        records.every((r) => r.kind === "expense" || r.kind === "income")
      ).toBe(true);
    });

    it("sets exactly one of expense / income on every record", () => {
      const records = buildJournalRecords(
        [expense({ id: "a" })],
        [income({ id: "b" })],
        accounts
      );
      for (const record of records) {
        expect(
          Number(Boolean(record.expense)) + Number(Boolean(record.income))
        ).toBe(1);
      }
    });

    it("drops soft-deleted rows", () => {
      const records = buildJournalRecords(
        [expense({ id: "a" }), expense({ id: "gone", deletedAt: "2026-09-11" })],
        [income({ id: "b" }), income({ id: "also-gone", deletedAt: "2026-09-02" })],
        accounts
      );
      expect(records.map((r) => r.activity.id)).toEqual(["a", "b"]);
    });
  });

  describe("account decoration", () => {
    it("prefers displayName over name", () => {
      const [record] = buildJournalRecords([expense()], [], accounts);
      expect(record.accountName).toBe("HDFC Savings");
    });

    it("falls back to name when displayName is blank", () => {
      const [record] = buildJournalRecords([], [income()], accounts);
      expect(record.accountName).toBe("ICICI Current");
    });

    it("keeps an account-less row, undecorated", () => {
      const [record] = buildJournalRecords(
        [expense({ accountId: undefined })],
        [],
        accounts
      );
      expect(record.accountName).toBeUndefined();
      // The row must still be in the journal — it is real money.
      expect(record.activity.amount).toBe(500);
    });

    it("keeps a row whose account no longer exists", () => {
      const records = buildJournalRecords(
        [expense({ accountId: "acc-deleted" })],
        [],
        accounts
      );
      expect(records).toHaveLength(1);
      expect(records[0].accountName).toBeUndefined();
    });

    it("never fills counterparty — the Journal has no other side", () => {
      const records = buildJournalRecords([expense()], [income()], accounts);
      expect(records.every((r) => r.counterparty === undefined)).toBe(true);
    });
  });

  describe("field mapping", () => {
    it("maps an expense to a debit with category metadata", () => {
      const [record] = buildJournalRecords(
        [expense({ subcategory: "Dining", tags: ["weekly", "", "food"] })],
        [],
        accounts
      );
      expect(record.activity.type).toBe("debit");
      expect(record.kind).toBe("expense");
      expect(record.category).toBe("Food & Groceries");
      expect(record.subcategory).toBe("Dining");
      expect(record.tags).toEqual(["weekly", "food"]);
      expect(record.activity.linkedExpenseId).toBe("e1");
    });

    it("maps an income to a credit with a source and no category", () => {
      const [record] = buildJournalRecords([], [income()], accounts);
      expect(record.activity.type).toBe("credit");
      expect(record.kind).toBe("income");
      expect(record.activity.source).toBe("Acme Payroll");
      expect(record.category).toBeUndefined();
      expect(record.tags).toEqual([]);
      expect(record.activity.linkedIncomeId).toBe("i1");
    });

    it.each([
      [true, "audited"],
      [false, "unaudited"],
      [undefined, "unaudited"],
    ])("maps isAudited %s to status %s", (isAudited, expected) => {
      const [record] = buildJournalRecords(
        [expense({ isAudited: isAudited as boolean | undefined })],
        [],
        accounts
      );
      expect(record.status).toBe(expected);
    });

    it("leaves income status undefined — income is never audited", () => {
      const [record] = buildJournalRecords([], [income()], accounts);
      expect(record.status).toBeUndefined();
    });

    it("gives rows without an id distinct synthetic ids", () => {
      const records = buildJournalRecords(
        [
          expense({ id: undefined, date: "2026-09-10" }),
          expense({ id: undefined, date: "2026-09-10" }),
        ],
        [],
        accounts
      );
      expect(records[0].activity.id).not.toBe(records[1].activity.id);
    });
  });

  describe("classification parity with the account screen", () => {
    it("classifies a refund identically to enrichAccountActivities", () => {
      const refund = income({ id: "r1", source: "Amazon refund" });
      const [journalRecord] = buildJournalRecords([], [refund], accounts);
      const [accountRecord] = enrichAccountActivities(
        [
          {
            id: "r1",
            date: refund.date,
            amount: refund.amount,
            type: "credit",
            source: refund.source,
            linkedIncomeId: "r1",
          },
        ],
        [],
        [refund],
        []
      );
      expect(journalRecord.isRefund).toBe(accountRecord.isRefund);
      expect(journalRecord.isRefund).toBe(true);
    });

    it("classifies an investment expense identically", () => {
      const sip = expense({ id: "s1", category: "Investment", note: "SIP" });
      const [journalRecord] = buildJournalRecords([sip], [], accounts);
      const [accountRecord] = enrichAccountActivities(
        [
          {
            id: "s1",
            date: sip.date,
            amount: sip.amount,
            type: "debit",
            category: sip.category,
            linkedExpenseId: "s1",
          },
        ],
        [sip],
        [],
        []
      );
      expect(journalRecord.isInvestment).toBe(accountRecord.isInvestment);
      expect(journalRecord.isInvestment).toBe(true);
    });

    it("classifies a bill identically", () => {
      const bill = expense({ id: "b1", category: "Bills & Communication" });
      const [journalRecord] = buildJournalRecords([bill], [], accounts);
      const [accountRecord] = enrichAccountActivities(
        [
          {
            id: "b1",
            date: bill.date,
            amount: bill.amount,
            type: "debit",
            category: bill.category,
            linkedExpenseId: "b1",
          },
        ],
        [bill],
        [],
        []
      );
      expect(journalRecord.isBill).toBe(accountRecord.isBill);
      expect(journalRecord.isBill).toBe(true);
    });
  });

  describe("scope", () => {
    it("returns only expenses under the expenses scope", () => {
      const records = buildJournalRecords([expense()], [income()], accounts, {
        scope: "expenses",
      });
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe("expense");
    });

    it("returns only incomes under the incomes scope", () => {
      const records = buildJournalRecords([expense()], [income()], accounts, {
        scope: "incomes",
      });
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe("income");
    });

    it("defaults to both", () => {
      expect(
        buildJournalRecords([expense()], [income()], accounts)
      ).toHaveLength(2);
    });
  });

  describe("search text", () => {
    it("precomputes a haystack containing the account name", () => {
      const [record] = buildJournalRecords([expense()], [], accounts);
      expect(record.searchText).toBeDefined();
      expect(record.searchText).toContain("hdfc savings");
    });

    it("is read back verbatim by buildAccountActivitySearchText", () => {
      const [record] = buildJournalRecords([expense()], [], accounts);
      expect(buildAccountActivitySearchText(record)).toBe(record.searchText);
    });

    it("includes the income source so a payer is findable", () => {
      const [record] = buildJournalRecords([], [income()], accounts);
      expect(record.searchText).toContain("acme payroll");
    });
  });

  describe("journalRecordsToRows", () => {
    it("splits records back into the two arrays, order preserved", () => {
      const e1 = expense({ id: "a" });
      const e2 = expense({ id: "b" });
      const i1 = income({ id: "c" });
      const records = buildJournalRecords([e1, e2], [i1], accounts);
      const rows = journalRecordsToRows(records);

      expect(rows.expenses.map((e) => e.id)).toEqual(["a", "b"]);
      expect(rows.incomes.map((i) => i.id)).toEqual(["c"]);
    });

    it("returns the original objects by reference so list memoization holds", () => {
      const e1 = expense({ id: "a" });
      const i1 = income({ id: "c" });
      const rows = journalRecordsToRows(
        buildJournalRecords([e1], [i1], accounts)
      );
      expect(rows.expenses[0]).toBe(e1);
      expect(rows.incomes[0]).toBe(i1);
    });

    it("round-trips a filtered subset without losing the invariant", () => {
      const records = buildJournalRecords(
        [expense({ id: "a" }), expense({ id: "b" })],
        [income({ id: "c" })],
        accounts
      );
      const filtered: JournalRecord[] = applyAccountActivityFilters(records, {
        ...createEmptyAccountActivityFilters(),
        kind: "expense",
      });
      const rows = journalRecordsToRows(filtered);
      expect(rows.expenses).toHaveLength(2);
      expect(rows.incomes).toHaveLength(0);
    });
  });

  describe("large datasets", () => {
    it("builds 25k records in one pass with haystacks precomputed", () => {
      const expenses = Array.from({ length: 20_000 }, (_, i) =>
        expense({ id: `e${i}`, amount: i + 1 })
      );
      const incomes = Array.from({ length: 5_000 }, (_, i) =>
        income({ id: `i${i}`, amount: i + 1 })
      );
      const records = buildJournalRecords(expenses, incomes, accounts);

      expect(records).toHaveLength(25_000);
      expect(new Set(records.map((r) => r.activity.id)).size).toBe(25_000);
      // Memoization must be in place, or every keystroke rebuilds 25k strings.
      expect(records.every((r) => r.searchText !== undefined)).toBe(true);
    });
  });
});
