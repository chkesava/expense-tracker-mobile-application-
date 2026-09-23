import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "@/shared/types/expense";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import {
  buildLedgerAuditContext,
  type LedgerAuditContext,
  type LedgerAuditInput,
  type LedgerAuditReadiness,
} from "./ledgerAudit";
import {
  checkDuplicateSmsFingerprint,
  checkDuplicateStatementFingerprint,
  checkInvalidAmount,
  checkInvalidDate,
  checkJournalRecordCount,
  checkMonthDateMismatch,
  checkOrphanAccountRef,
  checkOrphanBillRef,
  checkOrphanSpaceRef,
  checkOrphanSplitRef,
  checkOrphanSubscriptionRef,
  checkOrphanTripRef,
  checkZeroAmount,
} from "./ledgerAuditChecks";

const READY: LedgerAuditReadiness = {
  expensesComplete: true,
  incomesComplete: true,
  accountsLoaded: true,
  billsLoaded: true,
  subscriptionsLoaded: true,
  spacesLoaded: true,
  tripsLoaded: true,
  splitsLoaded: true,
  fromCache: false,
};

let nextId = 0;

function expense(over: Partial<Expense> = {}): Expense {
  nextId += 1;
  return {
    id: `exp-${nextId}`,
    amount: 250,
    category: "Food",
    note: "Lunch",
    date: "2026-09-10",
    month: "2026-09",
    createdAt: 1,
    ...over,
  };
}

function income(over: Partial<Income> = {}): Income {
  nextId += 1;
  return {
    id: `inc-${nextId}`,
    amount: 5000,
    source: "Salary",
    note: "September",
    date: "2026-09-01",
    month: "2026-09",
    createdAt: 1,
    ...over,
  };
}

function account(over: Partial<Account> = {}): Account {
  return { id: "acc-1", name: "HDFC", typeId: "type-bank", ...over };
}

function bill(over: Partial<CreditCardBill> = {}): CreditCardBill {
  return {
    id: "bill-1",
    accountId: "acc-1",
    statementDate: "2026-09-05",
    dueDate: "2026-09-25",
    statementAmount: 1000,
    minimumDueAmount: 100,
    amountPaid: 0,
    remainingAmount: 1000,
    currency: "INR",
    status: "UNPAID",
    reminderEnabled: false,
    reminderFrequency: "none",
    ...over,
  } as CreditCardBill;
}

function ctx(over: Partial<LedgerAuditInput> = {}): LedgerAuditContext {
  return buildLedgerAuditContext({
    expenses: [],
    incomes: [],
    accounts: [account()],
    readiness: READY,
    ...over,
  });
}

describe("ledger integrity checks (SPENDLY-112)", () => {
  describe("the Journal row-set invariant", () => {
    it("is clean when every active row becomes exactly one record", () => {
      const context = ctx({
        expenses: [expense(), expense()],
        incomes: [income()],
      });
      expect(checkJournalRecordCount(context)).toEqual([]);
    });

    it("ignores soft-deleted rows on both sides of the comparison", () => {
      const context = ctx({
        expenses: [expense(), expense({ deletedAt: "2026-09-12T00:00:00Z" })],
        incomes: [],
      });
      expect(checkJournalRecordCount(context)).toEqual([]);
    });

    it("carries the counts so the report can say how far off it is", () => {
      // A context whose active rows disagree with what the builder is handed is
      // the only way to manufacture the mismatch the invariant guards against.
      const context = ctx({ expenses: [expense()], incomes: [] });
      const rigged: LedgerAuditContext = {
        ...context,
        activeExpenses: [...context.activeExpenses, expense()],
      };
      const [found] = checkJournalRecordCount(rigged);
      expect(found.code).toBe("journal_record_count");
      expect(found.severity).toBe("error");
      expect(found.expected).toBe(2);
      expect(found.actual).toBe(1);
      expect(found.delta).toBe(-1);
    });
  });

  describe("dates", () => {
    it("flags a date that cannot be read", () => {
      const [found] = checkInvalidDate(ctx({ expenses: [expense({ date: "10-09-2026" })] }));
      expect(found.code).toBe("invalid_date");
      expect(found.field).toBe("date");
      expect(found.subjects).toHaveLength(1);
      expect(found.subjects[0].label).toBe("Food");
    });

    it("flags an empty date with its own wording", () => {
      const [found] = checkInvalidDate(ctx({ expenses: [expense({ date: "" })] }));
      expect(found.message).toContain("no date");
    });

    it("accepts an ordinary ISO date", () => {
      expect(checkInvalidDate(ctx({ expenses: [expense()] }))).toEqual([]);
    });

    it("rejects a well-formed date that is not a real day", () => {
      const found = checkInvalidDate(ctx({ expenses: [expense({ date: "2026-02-31" })] }));
      expect(found).toHaveLength(1);
    });
  });

  describe("month disagreeing with the date", () => {
    it("flags a December 31 row filed under the following January", () => {
      const [found] = checkMonthDateMismatch(
        ctx({ expenses: [expense({ date: "2026-12-31", month: "2027-01" })] })
      );
      expect(found.code).toBe("month_date_mismatch");
      expect(found.severity).toBe("warning");
      expect(found.field).toBe("month");
      expect(found.message).toContain("2027-01");
      expect(found.message).toContain("2026-12-31");
    });

    it("treats a missing month as clean, because monthKeyOf falls back to the date", () => {
      const rows = [expense({ month: "" }), expense({ month: undefined as unknown as string })];
      expect(checkMonthDateMismatch(ctx({ expenses: rows }))).toEqual([]);
    });

    it("leaves a row with an unreadable date to the date check", () => {
      const rows = [expense({ date: "nonsense", month: "2026-01" })];
      expect(checkMonthDateMismatch(ctx({ expenses: rows }))).toEqual([]);
    });

    it("checks incomes too", () => {
      const found = checkMonthDateMismatch(
        ctx({ incomes: [income({ date: "2026-09-01", month: "2026-08" })] })
      );
      expect(found).toHaveLength(1);
      expect(found[0].subjects[0].kind).toBe("income");
      expect(found[0].subjects[0].label).toBe("Salary");
    });
  });

  describe("amounts", () => {
    it("flags a negative amount as an error", () => {
      const [found] = checkInvalidAmount(ctx({ expenses: [expense({ amount: -40 })] }));
      expect(found.code).toBe("invalid_amount");
      expect(found.severity).toBe("error");
      expect(found.actual).toBe(-40);
    });

    it("flags an unusable number", () => {
      const [found] = checkInvalidAmount(
        ctx({ expenses: [expense({ amount: Number.NaN })] })
      );
      expect(found.message).toContain("not a usable number");
      expect(found.actual).toBeUndefined();
    });

    it("does not flag zero as invalid — that is a separate, softer finding", () => {
      expect(checkInvalidAmount(ctx({ expenses: [expense({ amount: 0 })] }))).toEqual([]);
    });

    it("flags zero as a warning", () => {
      const [found] = checkZeroAmount(ctx({ expenses: [expense({ amount: 0 })] }));
      expect(found.code).toBe("zero_amount");
      expect(found.severity).toBe("warning");
    });

    it("treats a sub-paisa amount as zero, via roundMoney rather than float identity", () => {
      const found = checkZeroAmount(ctx({ expenses: [expense({ amount: 0.001 })] }));
      expect(found).toHaveLength(1);
    });

    it("leaves one paisa alone", () => {
      expect(checkZeroAmount(ctx({ expenses: [expense({ amount: 0.01 })] }))).toEqual([]);
    });

    it("does not report an unusable number as zero as well", () => {
      expect(
        checkZeroAmount(ctx({ expenses: [expense({ amount: Number.NaN })] }))
      ).toEqual([]);
    });
  });

  describe("duplicate effects", () => {
    it("does not flag two rows with the same amount and date but no fingerprint", () => {
      // Two identical coffees in one day are both real. Without a key the
      // system guarantees to be unique there is no duplicate to report, and
      // guessing would make the whole report untrustworthy.
      const rows = [
        expense({ amount: 120, date: "2026-09-10", note: "Coffee" }),
        expense({ amount: 120, date: "2026-09-10", note: "Coffee" }),
      ];
      const context = ctx({ expenses: rows });
      expect(checkDuplicateSmsFingerprint(context)).toEqual([]);
      expect(checkDuplicateStatementFingerprint(context)).toEqual([]);
    });

    it("reports two rows sharing an SMS fingerprint as one finding carrying both", () => {
      const rows = [
        expense({ id: "a", smsFingerprint: "fp-1" }),
        expense({ id: "b", smsFingerprint: "fp-1" }),
      ];
      const found = checkDuplicateSmsFingerprint(ctx({ expenses: rows }));
      expect(found).toHaveLength(1);
      expect(found[0].subjects.map((subject) => subject.id)).toEqual(["a", "b"]);
      expect(found[0].severity).toBe("error");
    });

    it("reports three rows sharing a fingerprint as one finding with three subjects", () => {
      const rows = ["a", "b", "c"].map((id) => expense({ id, smsFingerprint: "fp-1" }));
      const found = checkDuplicateSmsFingerprint(ctx({ expenses: rows }));
      expect(found).toHaveLength(1);
      expect(found[0].subjects).toHaveLength(3);
      expect(found[0].message).toContain("3 transactions");
    });

    it("emits one finding when a pair is reachable by both fingerprint and reference", () => {
      const rows = [
        expense({ id: "a", smsFingerprint: "fp-1", smsExternalRef: "ref-1" }),
        expense({ id: "b", smsFingerprint: "fp-1", smsExternalRef: "ref-1" }),
      ];
      expect(checkDuplicateSmsFingerprint(ctx({ expenses: rows }))).toHaveLength(1);
    });

    it("matches an expense against an income when they share a reference", () => {
      const found = checkDuplicateSmsFingerprint(
        ctx({
          expenses: [expense({ id: "a", smsExternalRef: "ref-1" })],
          incomes: [income({ id: "b", smsExternalRef: "ref-1" })],
        })
      );
      expect(found).toHaveLength(1);
      expect(found[0].subjects.map((subject) => subject.kind)).toEqual([
        "expense",
        "income",
      ]);
    });

    it("ignores an empty fingerprint rather than grouping every blank row together", () => {
      const rows = [
        expense({ smsFingerprint: "" }),
        expense({ smsFingerprint: "   " }),
        expense({}),
      ];
      expect(checkDuplicateSmsFingerprint(ctx({ expenses: rows }))).toEqual([]);
    });

    it("reports a re-imported statement line", () => {
      const rows = [
        expense({ id: "a", statementImportFingerprint: "stmt-1" }),
        expense({ id: "b", statementImportFingerprint: "stmt-1" }),
      ];
      const found = checkDuplicateStatementFingerprint(ctx({ expenses: rows }));
      expect(found).toHaveLength(1);
      expect(found[0].code).toBe("duplicate_statement_fingerprint");
    });

    it("never counts a soft-deleted row towards a duplicate group", () => {
      const rows = [
        expense({ id: "a", smsFingerprint: "fp-1" }),
        expense({ id: "b", smsFingerprint: "fp-1", deletedAt: "2026-09-11T00:00:00Z" }),
      ];
      expect(checkDuplicateSmsFingerprint(ctx({ expenses: rows }))).toEqual([]);
    });
  });

  describe("orphaned relationships", () => {
    it("does not treat an expense with no account as an orphan", () => {
      // Cash spending belongs to no account. This is the loudest false
      // positive the catalogue could produce, so it is pinned.
      const found = checkOrphanAccountRef(ctx({ expenses: [expense()] }));
      expect(found).toEqual([]);
    });

    it("does not treat an income with no account as an orphan", () => {
      expect(checkOrphanAccountRef(ctx({ incomes: [income()] }))).toEqual([]);
    });

    it("treats an empty-string account id as absent, not as an orphan", () => {
      expect(
        checkOrphanAccountRef(ctx({ expenses: [expense({ accountId: "" })] }))
      ).toEqual([]);
    });

    it("flags an account id that resolves to nothing", () => {
      const [found] = checkOrphanAccountRef(
        ctx({ expenses: [expense({ accountId: "gone" })] })
      );
      expect(found.code).toBe("orphan_account_ref");
      expect(found.severity).toBe("error");
      expect(found.field).toBe("accountId");
    });

    it("says missing or removed, never deleted", () => {
      // Soft-deleted rows never reach this data, so "deleted" would be a claim
      // the ledger cannot support. SPENDLY-112c is where it becomes precise.
      const [found] = checkOrphanAccountRef(
        ctx({ expenses: [expense({ accountId: "gone" })] })
      );
      expect(found.message).toContain("missing or removed");
      expect(found.message).not.toContain("deleted");
    });

    it("clears once the account exists", () => {
      const found = checkOrphanAccountRef(
        ctx({ expenses: [expense({ accountId: "acc-1" })] })
      );
      expect(found).toEqual([]);
    });

    it("flags an income pointing at a missing account", () => {
      const found = checkOrphanAccountRef(
        ctx({ incomes: [income({ accountId: "gone" })] })
      );
      expect(found).toHaveLength(1);
      expect(found[0].subjects[0].kind).toBe("income");
    });

    it("flags a statement link that resolves to nothing", () => {
      const found = checkOrphanBillRef(
        ctx({ expenses: [expense({ creditCardBillId: "gone" })], bills: [bill()] })
      );
      expect(found).toHaveLength(1);
      expect(found[0].severity).toBe("error");
    });

    it("clears a statement link that resolves", () => {
      expect(
        checkOrphanBillRef(
          ctx({
            expenses: [expense({ creditCardBillId: "bill-1" })],
            bills: [bill()],
          })
        )
      ).toEqual([]);
    });

    it("flags a missing subscription as a warning rather than an error", () => {
      const [found] = checkOrphanSubscriptionRef(
        ctx({ expenses: [expense({ subscriptionId: "gone" })], subscriptions: [] })
      );
      expect(found.severity).toBe("warning");
      expect(found.field).toBe("subscriptionId");
    });

    it("clears a subscription that still exists", () => {
      expect(
        checkOrphanSubscriptionRef(
          ctx({
            expenses: [expense({ subscriptionId: "sub-1" })],
            subscriptions: [{ id: "sub-1", name: "Netflix" }],
          })
        )
      ).toEqual([]);
    });

    it("flags a missing space", () => {
      const found = checkOrphanSpaceRef(
        ctx({ expenses: [expense({ spaceId: "gone" })], spaces: [] })
      );
      expect(found).toHaveLength(1);
    });

    it("treats a null space id as absent", () => {
      expect(
        checkOrphanSpaceRef(ctx({ expenses: [expense({ spaceId: null })], spaces: [] }))
      ).toEqual([]);
    });

    it("flags a missing trip", () => {
      const found = checkOrphanTripRef(
        ctx({ expenses: [expense({ tripId: "gone" })], trips: [] })
      );
      expect(found).toHaveLength(1);
      expect(found[0].field).toBe("tripId");
    });

    it("flags a missing split", () => {
      const found = checkOrphanSplitRef(
        ctx({ expenses: [expense({ splitId: "gone" })], splits: [] })
      );
      expect(found).toHaveLength(1);
      expect(found[0].field).toBe("splitId");
    });

    it("never inspects incomes for an expense-only relationship", () => {
      // Income has no tripId; walking incomes here would be dead work and
      // would report a nonsense subject if the field were ever read loosely.
      const found = checkOrphanTripRef(
        ctx({ incomes: [income({ accountId: "gone" })], trips: [] })
      );
      expect(found).toEqual([]);
    });
  });

  describe("soft deletes", () => {
    const removed = { deletedAt: "2026-09-12T00:00:00Z" };

    it("is never reported by any check", () => {
      const context = ctx({
        expenses: [
          expense({
            ...removed,
            date: "bad",
            month: "2020-01",
            amount: -1,
            accountId: "gone",
            creditCardBillId: "gone",
            subscriptionId: "gone",
            spaceId: "gone",
            tripId: "gone",
            splitId: "gone",
            smsFingerprint: "fp-1",
            statementImportFingerprint: "stmt-1",
          }),
          expense({ ...removed, smsFingerprint: "fp-1" }),
        ],
        incomes: [income({ ...removed, date: "bad", accountId: "gone" })],
        bills: [],
        subscriptions: [],
        spaces: [],
        trips: [],
        splits: [],
      });

      for (const check of [
        checkJournalRecordCount,
        checkInvalidDate,
        checkMonthDateMismatch,
        checkInvalidAmount,
        checkZeroAmount,
        checkDuplicateSmsFingerprint,
        checkDuplicateStatementFingerprint,
        checkOrphanAccountRef,
        checkOrphanBillRef,
        checkOrphanSubscriptionRef,
        checkOrphanSpaceRef,
        checkOrphanTripRef,
        checkOrphanSplitRef,
      ]) {
        expect(check(context)).toEqual([]);
      }
    });
  });

  describe("subjects", () => {
    it("labels an expense by category and an income by source, never by id", () => {
      const context = ctx({
        expenses: [expense({ id: "e1", category: "Travel", amount: 900 })],
        incomes: [income({ id: "i1", source: "Freelance" })],
      });
      const [expenseSubject] = checkZeroAmount(
        ctx({ expenses: [expense({ category: "Travel", amount: 0 })] })
      )[0].subjects;
      expect(expenseSubject.label).toBe("Travel");

      const subject = context.subjectOf(context.activeIncomes[0], "income");
      expect(subject.label).toBe("Freelance");
      expect(subject.id).toBe("i1");
      expect(subject.date).toBe("2026-09-01");
      expect(subject.amount).toBe(5000);
    });

    it("falls back to the note, then to a generic word, when there is no label", () => {
      const context = ctx({ expenses: [expense({ category: "", note: "Parking" })] });
      expect(context.subjectOf(context.activeExpenses[0], "expense").label).toBe(
        "Parking"
      );

      const bare = ctx({ expenses: [expense({ category: "", note: "" })] });
      expect(bare.subjectOf(bare.activeExpenses[0], "expense").label).toBe("Expense");
    });

    it("omits an unusable amount rather than publishing NaN", () => {
      const context = ctx({ expenses: [expense({ amount: Number.NaN })] });
      expect(
        context.subjectOf(context.activeExpenses[0], "expense").amount
      ).toBeUndefined();
    });
  });
});
