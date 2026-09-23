import { describe, expect, it } from "vitest";

import type {
  AccountEntry,
  AccountPayment,
  Expense,
  Income,
} from "@/shared/types/expense";
import { CASHBACK_SOURCE_ID } from "@/shared/types/expense";
import {
  findJournalRelatedRecords,
  separateMoneyTotal,
} from "./journalRelatedRecords";

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    amount: 2_000,
    category: "Shopping",
    note: "Headphones",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-card",
    createdAt: null,
    ...over,
  } as Expense;
}

function income(over: Partial<Income> = {}): Income {
  return {
    id: "i1",
    amount: 500,
    source: "Refund",
    note: "",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-bank",
    createdAt: null,
    ...over,
  } as Income;
}

function payment(over: Partial<AccountPayment> = {}): AccountPayment {
  return {
    id: "p1",
    fromAccountId: "acc-bank",
    toAccountId: "acc-card",
    amount: 2_000,
    date: "2026-10-05",
    ...over,
  } as AccountPayment;
}

function entry(over: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: "en1",
    accountId: "acc-bank",
    amount: 2_000,
    direction: "debit",
    date: "2026-09-10",
    ...over,
  } as AccountEntry;
}

describe("journal related records (SPENDLY-110)", () => {
  describe("cashback", () => {
    it("finds cashback credited against this expense", () => {
      const records = findJournalRelatedRecords({
        expense: expense(),
        payments: [
          payment({
            id: "cb1",
            fromAccountId: CASHBACK_SOURCE_ID,
            sourceType: "cashback",
            linkedExpenseId: "e1",
            amount: 100,
            cashbackKind: "reward",
          }),
        ],
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        kind: "cashback",
        label: "Cashback received",
        amount: 100,
        isSameMoney: false,
      });
    });

    it("labels a statement credit distinctly", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense(),
        payments: [
          payment({
            sourceType: "cashback",
            linkedExpenseId: "e1",
            cashbackKind: "statement_credit",
          }),
        ],
      });
      expect(record.label).toBe("Statement credit received");
    });

    it("ignores cashback linked to a different expense", () => {
      expect(
        findJournalRelatedRecords({
          expense: expense(),
          payments: [
            payment({ sourceType: "cashback", linkedExpenseId: "other" }),
          ],
        })
      ).toEqual([]);
    });

    it("ignores a voided cashback row", () => {
      expect(
        findJournalRelatedRecords({
          expense: expense(),
          payments: [
            payment({
              sourceType: "cashback",
              linkedExpenseId: "e1",
              voidedAt: "2026-09-12",
            }),
          ],
        })
      ).toEqual([]);
    });

    it("is the only relation counted as separate money", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1", tripId: "trip-1" }),
        payments: [
          payment({ sourceType: "cashback", linkedExpenseId: "e1", amount: 100 }),
          payment({ id: "p2", creditCardBillId: "bill-1", amount: 2_000 }),
        ],
      });
      // The bill payment is the same rupees as the purchase, already in the
      // Journal; only the cashback is money that separately arrived.
      expect(separateMoneyTotal(records)).toBe(100);
    });
  });

  describe("credit-card bill", () => {
    it("reports the statement a purchase was billed to", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        kind: "bill",
        recordId: "bill-1",
        isSameMoney: true,
      });
    });

    it("reports the payments that settled that statement", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
        payments: [payment({ id: "p9", creditCardBillId: "bill-1", amount: 4_500 })],
      });
      const paymentRecord = records.find((r) => r.kind === "billPayment");
      expect(paymentRecord).toMatchObject({
        recordId: "p9",
        amount: 4_500,
        isSameMoney: true,
      });
    });

    it("flags the bill payment as the same money as the purchase", () => {
      // This is the guard rail: the purchase is already an Expense in the
      // Journal, so adding the settling payment would double-count it.
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
        payments: [payment({ creditCardBillId: "bill-1" })],
      });
      expect(records.every((r) => r.isSameMoney)).toBe(true);
      expect(separateMoneyTotal(records)).toBe(0);
    });

    it("ignores payments against a different statement", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
        payments: [payment({ creditCardBillId: "bill-2" })],
      });
      expect(records.filter((r) => r.kind === "billPayment")).toEqual([]);
    });

    it("ignores a voided payment", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
        payments: [
          payment({ creditCardBillId: "bill-1", voidedAt: "2026-10-06" }),
        ],
      });
      expect(records.filter((r) => r.kind === "billPayment")).toEqual([]);
    });

    it("does not count a cashback row as a bill payment", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ creditCardBillId: "bill-1" }),
        payments: [
          payment({
            sourceType: "cashback",
            creditCardBillId: "bill-1",
            linkedExpenseId: "other",
          }),
        ],
      });
      expect(records.filter((r) => r.kind === "billPayment")).toEqual([]);
    });

    it("reports nothing when the expense is on no statement", () => {
      expect(
        findJournalRelatedRecords({
          expense: expense(),
          payments: [payment({ creditCardBillId: "bill-1" })],
        })
      ).toEqual([]);
    });
  });

  describe("investment movements", () => {
    it("pairs an entry on the same account, date and amount", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ accountId: "acc-bank", amount: 2_000 }),
        entries: [entry({ transferId: "tr-1" })],
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        kind: "investment",
        recordId: "en1",
        isSameMoney: true,
      });
    });

    it("ignores an entry with no pairing key", () => {
      expect(
        findJournalRelatedRecords({
          expense: expense({ accountId: "acc-bank" }),
          entries: [entry()],
        })
      ).toEqual([]);
    });

    it("ignores an entry on another account or date", () => {
      expect(
        findJournalRelatedRecords({
          expense: expense({ accountId: "acc-bank" }),
          entries: [
            entry({ accountId: "acc-other", transferId: "t" }),
            entry({ id: "en2", date: "2026-09-11", transferId: "t" }),
          ],
        })
      ).toEqual([]);
    });

    it("tolerates sub-cent amount differences", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ accountId: "acc-bank", amount: 2_000 }),
        entries: [entry({ amount: 2_000.004, correlationId: "c-1" })],
      });
      expect(records).toHaveLength(1);
    });

    it("works for an income row too", () => {
      const records = findJournalRelatedRecords({
        income: income({ accountId: "acc-bank", amount: 500 }),
        entries: [entry({ amount: 500, direction: "credit", correlationId: "c" })],
      });
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe("investment");
    });
  });

  describe("groupings", () => {
    it("reports a split and says edits belong to it", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({ splitId: "sp-1" }),
      });
      expect(record).toMatchObject({ kind: "split", recordId: "sp-1" });
      expect(record.detail).toMatch(/split/i);
    });

    it("reports trip, space and subscription", () => {
      const records = findJournalRelatedRecords({
        expense: expense({
          tripId: "t-1",
          spaceId: "s-1",
          subscriptionId: "sub-1",
        }),
      });
      expect(records.map((r) => r.kind)).toEqual(["trip", "space", "subscription"]);
    });

    it("uses a resolved name when the caller supplies one", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({ tripId: "t-1" }),
        nameById: (id) => (id === "t-1" ? "Goa 2026" : undefined),
      });
      expect(record.label).toBe("Goa 2026");
    });

    it("falls back to generic copy when the name is unknown", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({ tripId: "t-1" }),
        nameById: () => undefined,
      });
      expect(record.label).toBe("Part of a trip");
    });

    it("counts groupings as the same money, never separate", () => {
      const records = findJournalRelatedRecords({
        expense: expense({ tripId: "t-1", spaceId: "s-1" }),
      });
      expect(records.every((r) => r.isSameMoney)).toBe(true);
    });
  });

  describe("provenance", () => {
    it("reports an SMS import with its match status", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({
          smsExternalRef: "ref-1",
          smsMatchStatus: "NEEDS_REVIEW",
        }),
      });
      expect(record).toMatchObject({
        kind: "smsImport",
        detail: "NEEDS_REVIEW",
      });
    });

    it("falls back to the fingerprint when there is no external ref", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({ smsFingerprint: "fp-1" }),
      });
      expect(record.kind).toBe("smsImport");
    });

    it("reports a statement import", () => {
      const [record] = findJournalRelatedRecords({
        expense: expense({ statementImportFingerprint: "sf-1" }),
      });
      expect(record).toMatchObject({ kind: "statementImport" });
      expect(record.detail).toMatch(/duplicate/i);
    });

    it("works for an SMS-imported income", () => {
      const [record] = findJournalRelatedRecords({
        income: income({ smsFingerprint: "fp-2" }),
      });
      expect(record.kind).toBe("smsImport");
    });
  });

  describe("ordering and empties", () => {
    it("returns nothing for a plain row with no connections", () => {
      expect(findJournalRelatedRecords({ expense: expense() })).toEqual([]);
    });

    it("returns nothing for an empty input", () => {
      expect(findJournalRelatedRecords({})).toEqual([]);
    });

    it("orders money first, then groupings, then provenance", () => {
      const records = findJournalRelatedRecords({
        expense: expense({
          creditCardBillId: "bill-1",
          tripId: "t-1",
          smsFingerprint: "fp-1",
        }),
        payments: [
          payment({ sourceType: "cashback", linkedExpenseId: "e1", amount: 50 }),
          payment({ id: "p2", creditCardBillId: "bill-1" }),
        ],
      });
      expect(records.map((r) => r.kind)).toEqual([
        "cashback",
        "bill",
        "billPayment",
        "trip",
        "smsImport",
      ]);
    });
  });

  describe("separateMoneyTotal", () => {
    it("ignores relations with no amount", () => {
      expect(
        separateMoneyTotal([
          { kind: "trip", label: "t", isSameMoney: false },
          { kind: "cashback", label: "c", amount: 25, isSameMoney: false },
        ])
      ).toBe(25);
    });

    it("is zero when everything is the same money", () => {
      expect(
        separateMoneyTotal([
          { kind: "billPayment", label: "b", amount: 900, isSameMoney: true },
        ])
      ).toBe(0);
    });
  });
});
