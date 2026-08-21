import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import {
  buildCreditCardLedger,
  collectCreditBillAllocationPatches,
  oldestOpenStatement,
  type LedgerBillSlice,
} from "./creditCardLedger";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "./autoCreditCardBills";

/**
 * The reported bug, with the user's real numbers. Slice card, statement closes
 * on the 20th, ₹89,000 limit. The 21 Jul → 20 Aug cycle had ₹27,875 of spend
 * and a ₹19,000 payment was made on 13 Aug toward the *previous* statement.
 * The app showed ₹17,764 (27,875 − part of that payment) as both the statement
 * and the current cycle usage.
 */
const slice: Account = {
  id: "cc-slice",
  name: "Slice",
  typeId: "t-credit",
  billGenerationDay: 20,
  creditLimit: 89000,
};

function expense(date: string, amount: number, accountId = slice.id): Expense {
  return {
    amount,
    category: "Shopping",
    note: "",
    date,
    month: date.slice(0, 7),
    accountId,
    createdAt: null,
  };
}

function payment(id: string, date: string, amount: number): AccountPayment {
  return {
    id,
    fromAccountId: "bank-1",
    toAccountId: slice.id,
    amount,
    date,
  };
}

function statement(
  statementDate: string,
  periodStart: string,
  statementAmount: number,
  overrides: Partial<LedgerBillSlice> = {}
): LedgerBillSlice {
  return {
    id: `bill-${statementDate}`,
    accountId: slice.id,
    statementDate,
    billingPeriodStart: periodStart,
    billingPeriodEnd: statementDate,
    statementAmount,
    amountPaid: 0,
    status: "UPCOMING",
    ...overrides,
  };
}

describe("buildCreditCardLedger — reported Slice scenario", () => {
  // 21 Jul → 20 Aug spend totalling 27,875.
  const julyToAugustSpend: Expense[] = [
    expense("2026-07-21", 10000),
    expense("2026-07-30", 7875),
    expense("2026-08-05", 6000),
    expense("2026-08-19", 4000),
  ];
  // The 19,000 paid on 13 Aug was for the statement that closed on 20 Jul.
  const augustPayment = payment("pay-aug-13", "2026-08-13", 19000);

  it("statements the gross cycle spend even when last month's bill was paid mid-cycle", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...julyToAugustSpend, expense("2026-06-25", 10301)],
      payments: [augustPayment],
      bills: [],
      today: "2026-08-21",
    });

    const august = ledger.statements.find(
      (item) => item.statementDate === "2026-08-20"
    );
    expect(august).toMatchObject({
      periodStart: "2026-07-21",
      periodEnd: "2026-08-20",
      billed: 27875,
      paid: 0,
      remaining: 27875,
      status: "unpaid",
    });
    expect(ledger.unappliedCredit).toBe(8699);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("applies the payment to the statement it was actually for", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...julyToAugustSpend, expense("2026-06-25", 10301)],
      payments: [augustPayment],
      bills: [],
      today: "2026-08-21",
    });

    const july = ledger.statements.find(
      (item) => item.statementDate === "2026-07-20"
    );
    expect(july).toMatchObject({
      billed: 10301,
      paid: 10301,
      remaining: 0,
      status: "paid",
    });
    // Leftover after the July bill stays as unapplied credit — it does not
    // stamp the newly generated August statement as partially paid.
    expect(ledger.statementDue).toBe(27875);
    expect(ledger.unappliedCredit).toBe(8699);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("resets the cycle to zero on the close date and holds the statement as due", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: julyToAugustSpend,
      payments: [],
      bills: [statement("2026-08-20", "2026-07-21", 27875)],
      today: "2026-08-20",
    });

    expect(ledger.unbilledSpend).toBe(0);
    expect(ledger.statementDue).toBe(27875);
    expect(ledger.totalOutstanding).toBe(27875);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("counts only post-close spend in the new cycle", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...julyToAugustSpend, expense("2026-08-21", 1500)],
      payments: [],
      bills: [statement("2026-08-20", "2026-07-21", 27875)],
      today: "2026-08-25",
    });

    expect(ledger.openCycle).toMatchObject({
      start: "2026-08-21",
      end: "2026-09-20",
    });
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.totalOutstanding).toBe(29375);
    expect(ledger.availableCredit).toBe(89000 - 1500);
  });

  it("frees the limit only when the statement is actually paid", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...julyToAugustSpend, expense("2026-08-21", 1500)],
      payments: [payment("pay-aug-25", "2026-08-25", 27875)],
      bills: [statement("2026-08-20", "2026-07-21", 27875)],
      today: "2026-08-25",
    });

    expect(ledger.statementDue).toBe(0);
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.availableCredit).toBe(89000 - 1500);
  });

  it("reduces unbilled spend while the cycle is still open", () => {
    const postedThroughToday = julyToAugustSpend.filter(
      (item) => item.date <= "2026-08-13"
    );
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...postedThroughToday, expense("2026-06-25", 10301)],
      payments: [augustPayment],
      bills: [],
      today: "2026-08-13",
    });

    expect(
      ledger.statements.find((item) => item.statementDate === "2026-08-20")
    ).toBeUndefined();
    // 10,000 + 7,875 + 6,000 posted through Aug 13; leftover 8,699.
    expect(ledger.unbilledSpend).toBe(15176);
    expect(ledger.statementDue).toBe(0);
  });
});

describe("buildCreditCardLedger — windows and allocation", () => {
  it("never bills the close date in two statements", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [
        expense("2026-07-20", 500),
        expense("2026-07-21", 300),
        expense("2026-08-20", 200),
      ],
      payments: [],
      bills: [],
      today: "2026-08-20",
    });

    const july = ledger.statements.find((s) => s.statementDate === "2026-07-20");
    const august = ledger.statements.find((s) => s.statementDate === "2026-08-20");
    expect(july?.billed).toBe(500);
    expect(august?.billed).toBe(500);
    expect(august?.periodStart).toBe("2026-07-21");
  });

  it("snaps a drifted close date onto the current cycle instead of double-billing", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [
        expense("2026-07-21", 10000),
        expense("2026-08-05", 7764),
        expense("2026-08-21", 500),
      ],
      payments: [],
      bills: [
        statement("2026-08-21", "2026-07-21", 17764, {
          billingPeriodEnd: "2026-08-21",
        }),
      ],
      today: "2026-08-21",
    });

    const augustStatements = ledger.statements.filter(
      (item) =>
        item.statementDate === "2026-08-20" || item.statementDate === "2026-08-21"
    );
    expect(augustStatements).toHaveLength(1);
    expect(augustStatements[0]).toMatchObject({
      statementDate: "2026-08-20",
      periodStart: "2026-07-21",
      periodEnd: "2026-08-20",
      billId: "bill-2026-08-21",
      billed: 17764,
    });
    expect(ledger.unbilledSpend).toBe(500);
  });

  it("never reports more paid than billed on a cycle", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-07-25", 1000)],
      payments: [payment("pay-big", "2026-08-21", 5000)],
      bills: [],
      today: "2026-08-25",
    });

    for (const item of ledger.statements) {
      expect(item.paid).toBeLessThanOrEqual(item.billed);
    }
    expect(ledger.unappliedCredit).toBe(4000);
    expect(ledger.totalOutstanding).toBe(0);
  });

  it("settles the oldest open statement first", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [
        expense("2026-06-25", 3000),
        expense("2026-07-25", 5000),
      ],
      payments: [payment("pay-1", "2026-08-21", 4000)],
      bills: [],
      today: "2026-08-25",
    });

    const june = ledger.statements.find((s) => s.statementDate === "2026-06-20");
    const july = ledger.statements.find((s) => s.statementDate === "2026-07-20");
    const august = ledger.statements.find((s) => s.statementDate === "2026-08-20");
    expect(june?.billed).toBe(0);
    expect(july?.paid).toBe(3000);
    expect(august?.paid).toBe(1000);
    expect(oldestOpenStatement(ledger)?.statementDate).toBe("2026-08-20");
  });

  it("keeps a stored statement amount so reconciled edits stick", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [],
      bills: [statement("2026-08-20", "2026-07-21", 9999)],
      today: "2026-08-21",
    });

    expect(ledger.statementDue).toBe(9999);
  });

  it("treats a mark-as-paid settlement with no ledger payment as paid", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, {
          amountPaid: 6000,
          status: "PAID",
        }),
      ],
      today: "2026-08-21",
    });

    expect(ledger.statementDue).toBe(0);
  });

  it("does not double count a payment already linked to its statement", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-25", 400)],
      payments: [payment("pay-linked", "2026-08-22", 6000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, {
          amountPaid: 6000,
          paymentIds: ["pay-linked"],
          status: "PAID",
        }),
      ],
      today: "2026-08-25",
    });

    expect(ledger.statementDue).toBe(0);
    expect(ledger.unbilledSpend).toBe(400);
    expect(ledger.unappliedCredit).toBe(0);
  });

  it("lets a linked overpayment settle the next statement", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-07-25", 3000), expense("2026-08-05", 5000)],
      payments: [payment("pay-july", "2026-08-22", 8000)],
      bills: [
        statement("2026-07-20", "2026-06-21", 3000, {
          amountPaid: 3000,
          paymentIds: ["pay-july"],
          status: "PAID",
        }),
        statement("2026-08-20", "2026-07-21", 5000),
      ],
      today: "2026-08-25",
    });

    const july = ledger.statements.find((s) => s.statementDate === "2026-07-20");
    const august = ledger.statements.find((s) => s.statementDate === "2026-08-20");
    expect(july).toMatchObject({ paid: 3000, remaining: 0, status: "paid" });
    expect(august).toMatchObject({ billed: 5000, paid: 5000, remaining: 0 });
    expect(ledger.statementDue).toBe(0);
  });

  it("falls back to plain spend minus payments without a generation day", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: undefined },
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-1", "2026-08-10", 1000)],
      bills: [],
      today: "2026-08-21",
    });

    expect(ledger.statements).toEqual([]);
    expect(ledger.totalOutstanding).toBe(5000);
    expect(ledger.availableCredit).toBe(84000);
  });

  it("ignores other cards' expenses and payments", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-06", 500, "cc-other")],
      payments: [
        {
          id: "pay-other",
          fromAccountId: "bank-1",
          toAccountId: "cc-other",
          amount: 6000,
          date: "2026-08-21",
        },
      ],
      bills: [],
      today: "2026-08-21",
    });

    expect(ledger.statementDue).toBe(6000);
  });
});

describe("collectCreditBillAllocationPatches", () => {
  it("links a legacy payment to the statement it settled", () => {
    const bills = [statement("2026-08-20", "2026-07-21", 6000)];
    const patches = collectCreditBillAllocationPatches({
      accounts: [slice],
      isCreditAccount: () => true,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-legacy", "2026-08-22", 6000)],
      bills,
      today: "2026-08-25",
    });

    expect(patches).toEqual([
      {
        billId: "bill-2026-08-20",
        amountPaid: 6000,
        paymentIds: ["pay-legacy"],
        paymentDate: "2026-08-22",
      },
    ]);
  });

  it("emits nothing when stored statements already match the ledger", () => {
    const patches = collectCreditBillAllocationPatches({
      accounts: [slice],
      isCreditAccount: () => true,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-linked", "2026-08-22", 6000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, {
          amountPaid: 6000,
          paymentIds: ["pay-linked"],
          status: "PAID",
        }),
      ],
      today: "2026-08-25",
    });

    expect(patches).toEqual([]);
  });

  it("never walks a settlement backwards", () => {
    const patches = collectCreditBillAllocationPatches({
      accounts: [slice],
      isCreditAccount: () => true,
      expenses: [expense("2026-08-05", 6000)],
      payments: [],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, {
          amountPaid: 9000,
          status: "PAID",
        }),
      ],
      today: "2026-08-25",
    });

    expect(patches).toEqual([]);
  });

  it("walks leftover credit off an auto bill the user has not paid", () => {
    const patches = collectCreditBillAllocationPatches({
      accounts: [slice],
      isCreditAccount: () => true,
      expenses: [expense("2026-08-05", 28101), expense("2026-06-25", 10301)],
      payments: [payment("pay-july", "2026-08-13", 19000)],
      bills: [
        statement("2026-07-20", "2026-06-21", 10301, {
          amountPaid: 10301,
          paymentIds: ["pay-july"],
          status: "PAID",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
        }),
        statement("2026-08-20", "2026-07-21", 28101, {
          amountPaid: 7497,
          remainingAmount: 20604,
          paymentIds: ["pay-july"],
          status: "PARTIALLY_PAID",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
        }),
      ],
      today: "2026-08-21",
    });

    expect(patches).toEqual([
      {
        billId: "bill-2026-08-20",
        amountPaid: 0,
        paymentIds: [],
        paymentDate: undefined,
      },
    ]);
  });

  it("skips non-credit accounts", () => {
    const patches = collectCreditBillAllocationPatches({
      accounts: [slice],
      isCreditAccount: () => false,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-legacy", "2026-08-22", 6000)],
      bills: [statement("2026-08-20", "2026-07-21", 6000)],
      today: "2026-08-25",
    });

    expect(patches).toEqual([]);
  });
});
