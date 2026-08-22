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

function payment(
  id: string,
  date: string,
  amount: number,
  toAccountId = slice.id
): AccountPayment {
  return {
    id,
    fromAccountId: "bank-1",
    toAccountId,
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
    // Leftover after the July bill does not stamp the newly generated August
    // statement as partially paid.
    expect(ledger.statementDue).toBe(27875);
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

/**
 * The stored `amountPaid` floor is for out-of-band settlements only. When the
 * stamp came from a real AccountPayment, the allocation above has already
 * decided where that money goes — crediting it again through the floor counted
 * the same rupees twice, once on the statement and once as free credit, and
 * showed a statement the user never paid as PARTIALLY PAID.
 */
describe("buildCreditCardLedger — stored amountPaid floor", () => {
  it("does not settle a manual statement from a payment dated before it closed", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 28101)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [
        // Stamped by applyPaymentToBill; the payment predates the close date.
        statement("2026-08-20", "2026-07-21", 28101, {
          amountPaid: 19000,
          paymentIds: ["pay-aug-13"],
          status: "PARTIALLY_PAID",
        }),
      ],
      today: "2026-08-21",
    });

    const august = ledger.statements.find((s) => s.statementDate === "2026-08-20");
    expect(august).toMatchObject({
      billed: 28101,
      paid: 0,
      remaining: 28101,
      status: "unpaid",
    });
    // The 19,000 is counted once, as credit against the next cycle.
    expect(ledger.statementDue).toBe(28101);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("does not carry a partial leftover stamp onto a manual statement", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 28101), expense("2026-06-25", 11503)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 28101, {
          amountPaid: 7497,
          paymentIds: ["pay-aug-13"],
          status: "PARTIALLY_PAID",
        }),
      ],
      today: "2026-08-21",
    });

    expect(ledger.statementDue).toBe(28101);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("still honours a mark-as-paid settlement with no linked payment", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 28101)],
      payments: [],
      bills: [
        statement("2026-08-20", "2026-07-21", 28101, {
          amountPaid: 28101,
          status: "PAID",
        }),
      ],
      today: "2026-08-21",
    });

    expect(ledger.statementDue).toBe(0);
  });

  it("adds an out-of-band top-up on top of the allocated payment", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 10000)],
      payments: [payment("pay-aug-21", "2026-08-21", 4000)],
      bills: [
        // 4,000 came through the ledger; the other 6,000 was settled off-app.
        statement("2026-08-20", "2026-07-21", 10000, {
          amountPaid: 10000,
          paymentIds: ["pay-aug-21"],
          status: "PAID",
        }),
      ],
      today: "2026-08-22",
    });

    expect(ledger.statementDue).toBe(0);
  });

  it("never settles a statement that has not closed yet", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-25", 5000)],
      payments: [],
      bills: [
        statement("2026-09-20", "2026-08-21", 5000, {
          amountPaid: 5000,
          status: "PAID",
        }),
      ],
      today: "2026-08-26",
    });

    const september = ledger.statements.find(
      (s) => s.statementDate === "2026-09-20"
    );
    expect(september).toMatchObject({ paid: 0, remaining: 5000, status: "unpaid" });
  });
});

/**
 * Cancelling a statement voids the document, not the debt — the spend it covered
 * is still owed. But it is not *this cycle's* spend, so it must not eat the
 * limit: `availableCredit` is `limit − unbilledSpend` and unbilled means the
 * open window only.
 */
describe("buildCreditCardLedger — cancelled statements", () => {
  it("keeps cancelled statement spend owed without eating the limit", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-21",
    });

    expect(ledger.cancelledSpend).toBe(6000);
    expect(ledger.unbilledSpend).toBe(0);
    expect(ledger.statementDue).toBe(0);
    // Still owed...
    expect(ledger.totalOutstanding).toBe(6000);
    // ...but the limit is intact, because none of it is this-cycle spend.
    expect(ledger.availableCredit).toBe(89000);
  });

  it("separates cancelled spend from open-cycle spend", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-25", 1500)],
      payments: [],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    expect(ledger.cancelledSpend).toBe(6000);
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.totalOutstanding).toBe(7500);
    expect(ledger.availableCredit).toBe(89000 - 1500);
    expect(ledger.openCycle.spend).toBe(1500);
  });

  it("settles the cancelled bucket before the open cycle", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-25", 1500)],
      payments: [payment("pay-1", "2026-08-26", 6500)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    // 6,000 clears the cancelled bucket, the remaining 500 reduces this cycle.
    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.unbilledSpend).toBe(1000);
    expect(ledger.totalOutstanding).toBe(1000);
    expect(ledger.availableCredit).toBe(89000 - 1000);
  });

  it("leaves credit unapplied once both buckets are clear", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-1", "2026-08-26", 8000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.unbilledSpend).toBe(0);
    expect(ledger.totalOutstanding).toBe(0);
    expect(ledger.availableCredit).toBe(89000);
  });

  it("reports no cancelled spend when every statement is live", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-25", 1500)],
      payments: [],
      bills: [statement("2026-08-20", "2026-07-21", 6000)],
      today: "2026-08-26",
    });

    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.statementDue).toBe(6000);
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.totalOutstanding).toBe(7500);
  });
});

/**
 * Leftover credit belongs to the cycle the payment was made in. Credit paid
 * during the open cycle may reduce that cycle's spend; credit left over from a
 * payment made *before* the cycle opened has outlived the cycle it was paid in
 * and is a standing credit balance. It must not silently absorb spend charged
 * after the statement closed — the card would show ₹0 unbilled with a fresh
 * charge sitting on it.
 */
describe("buildCreditCardLedger — leftover credit does not cross a close date", () => {
  // The spec's worked example, end to end: 21 Jul–20 Aug cycle of 27,875, a
  // 19,000 payment on 13 Aug against the 20 Jul statement of 10,301, then 1,500
  // of fresh spend on 21 Aug after the 20 Aug close.
  const cycleSpend: Expense[] = [
    expense("2026-07-21", 10000),
    expense("2026-07-30", 7875),
    expense("2026-08-05", 6000),
    expense("2026-08-19", 4000),
  ];

  it("counts spend charged after the close even with credit carried over", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...cycleSpend, expense("2026-06-25", 10301), expense("2026-08-21", 1500)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-25",
    });

    expect(ledger.statementDue).toBe(27875);
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.availableCredit).toBe(89000 - 1500);
    expect(ledger.totalOutstanding).toBe(27875 + 1500);
  });

  it("still lets credit paid inside the open cycle reduce that cycle's spend", () => {
    const postedThroughToday = cycleSpend.filter((item) => item.date <= "2026-08-13");
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [...postedThroughToday, expense("2026-06-25", 10301)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-13",
    });

    // 10,000 + 7,875 + 6,000 posted, 8,699 of in-cycle credit left after the
    // July statement — the cycle is still open, so it does apply here.
    expect(ledger.unbilledSpend).toBe(15176);
  });

  it("does not let carried credit discount spend charged after the close", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: 21 },
      expenses: [
        expense("2026-07-15", 11503),
        expense("2026-08-10", 28101),
        // Charged the day after the statement closed.
        expense("2026-08-22", 393),
      ],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    expect(ledger.openCycle.start).toBe("2026-08-22");
    expect(ledger.statementDue).toBe(28101);
    expect(ledger.unbilledSpend).toBe(393);
    expect(ledger.availableCredit).toBe(89000 - 393);
    // 28,101 statement + the 393 charged after the close. The unmatched credit
    // does not reduce it — see "credit beyond every debt is dropped".
    expect(ledger.totalOutstanding).toBe(28494);
  });

  it("lets carried credit still settle a cancelled statement's spend", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000), expense("2026-08-25", 1500)],
      payments: [payment("pay-aug-10", "2026-08-10", 6000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    // The payment predates the open cycle, but so does the cancelled spend, so
    // it settles it. The 1,500 charged this cycle stands on its own.
    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.unbilledSpend).toBe(1500);
    expect(ledger.availableCredit).toBe(89000 - 1500);
  });

  it("keeps a payment made on the first day of the cycle as cycle credit", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-07-25", 5000), expense("2026-08-21", 2000)],
      // 2026-08-21 is the first day of the open cycle for a card closing on 20.
      payments: [payment("pay-boundary", "2026-08-21", 6000)],
      bills: [],
      today: "2026-08-25",
    });

    // 5,000 settles the 20 Aug statement, the remaining 1,000 is in-cycle credit
    // and reduces the 2,000 charged on 21 Aug.
    expect(ledger.statementDue).toBe(0);
    expect(ledger.unbilledSpend).toBe(1000);
  });
});

/**
 * Paying more than the card owes is blocked at entry, so credit that outlives
 * every debt can only come from a payment recorded against spend the app never
 * saw. It is dropped rather than carried as a balance: reporting it as "paid in
 * advance" told the user something untrue about their own money, and netting it
 * out of `totalOutstanding` hid real debt behind a phantom credit.
 */
describe("buildCreditCardLedger — credit beyond every debt is dropped", () => {
  it("still reports real unbilled spend when a payment exceeded every statement", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: 21 },
      expenses: [
        expense("2026-07-15", 11503),
        expense("2026-08-10", 28101),
        expense("2026-08-22", 393),
      ],
      // 19,000 against an 11,503 statement: 7,497 has no debt to match.
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    // The 393 charged this cycle is a real debt and stays visible.
    expect(ledger.unbilledSpend).toBe(393);
    expect(ledger.statementDue).toBe(28101);
    expect(ledger.totalOutstanding).toBe(28494);
    expect(ledger.availableCredit).toBe(89000 - 393);
  });

  it("never lets unmatched credit hide a debt behind a zero", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: 21 },
      // No statements at all, so the whole payment is unmatched.
      expenses: [expense("2026-08-22", 393)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    expect(ledger.unbilledSpend).toBe(393);
    expect(ledger.totalOutstanding).toBe(393);
  });

  it("keeps outstanding equal to the debt when nothing was overpaid", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-10", 28101), expense("2026-08-25", 500)],
      payments: [],
      bills: [],
      today: "2026-08-26",
    });

    expect(ledger.totalOutstanding).toBe(28601);
  });

  it("does not resurrect cancelled spend that credit already settled", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-1", "2026-08-26", 9000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.totalOutstanding).toBe(0);
  });

  it("leaves availableCredit on the unbilled rule", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: 21 },
      expenses: [expense("2026-07-15", 11503), expense("2026-08-22", 393)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    // Unmatched credit does not hand back limit either.
    expect(ledger.availableCredit).toBe(89000 - 393);
    expect(ledger.unbilledSpend).toBe(393);
  });
});

/**
 * Roar (bill day 1): the July statement was paid on 1 Aug, then 1 Aug–today
 * charges were recorded. Those charges are "clear" in the list but were left
 * inside the paid window, so unbilled showed ₹1,291 (2 Aug onward) instead of
 * ₹1,447 (1 Aug grocery + the later five).
 */
describe("buildCreditCardLedger — paid close-day spend starts the new cycle", () => {
  const roar: Account = {
    ...slice,
    id: "cc-roar",
    name: "Roar",
    billGenerationDay: 1,
    creditLimit: 35000,
  };
  const roarSpend = (date: string, amount: number): Expense =>
    expense(date, amount, roar.id);
  const augustCharges: Expense[] = [
    roarSpend("2026-08-01", 156),
    roarSpend("2026-08-03", 190),
    roarSpend("2026-08-04", 299),
    roarSpend("2026-08-08", 374),
    roarSpend("2026-08-09", 299),
    roarSpend("2026-08-21", 129),
  ];
  const paidCloseBill: LedgerBillSlice = {
    id: "bill-roar-aug-1",
    accountId: roar.id,
    statementDate: "2026-08-01",
    billingPeriodStart: "2026-07-01",
    billingPeriodEnd: "2026-08-01",
    statementAmount: 4380,
    amountPaid: 4380,
    status: "PAID",
    paymentIds: ["pay-roar-aug-1"],
  };

  it("counts 1 Aug–today spend as unbilled after the statement is paid on close day", () => {
    const ledger = buildCreditCardLedger({
      account: roar,
      expenses: [roarSpend("2026-07-15", 4380), ...augustCharges],
      payments: [payment("pay-roar-aug-1", "2026-08-01", 4380, roar.id)],
      bills: [paidCloseBill],
      today: "2026-08-22",
    });

    expect(ledger.statementDue).toBe(0);
    expect(ledger.unbilledSpend).toBe(1447);
    expect(ledger.totalOutstanding).toBe(1447);
    expect(ledger.availableCredit).toBe(33553);
    expect(ledger.openCycle.start).toBe("2026-08-01");
    expect(
      ledger.statements.find((item) => item.statementDate === "2026-08-01")
        ?.periodEnd
    ).toBe("2026-07-31");
  });

  it("keeps generation-day spend on the statement while that bill is still unpaid", () => {
    const ledger = buildCreditCardLedger({
      account: roar,
      expenses: augustCharges,
      payments: [],
      bills: [{ ...paidCloseBill, amountPaid: 0, status: "OVERDUE", paymentIds: [] }],
      today: "2026-08-22",
    });

    expect(ledger.openCycle.start).toBe("2026-08-02");
    expect(ledger.unbilledSpend).toBe(1291);
    expect(ledger.statementDue).toBe(4380);
    expect(
      ledger.statements.find((item) => item.statementDate === "2026-08-01")
        ?.periodEnd
    ).toBe("2026-08-01");
  });

  it("does not move close-day spend when the statement is paid after it closed", () => {
    const ledger = buildCreditCardLedger({
      account: roar,
      expenses: [roarSpend("2026-07-15", 4380), ...augustCharges],
      payments: [payment("pay-roar-aug-5", "2026-08-05", 4380, roar.id)],
      bills: [{ ...paidCloseBill, paymentIds: ["pay-roar-aug-5"] }],
      today: "2026-08-22",
    });

    expect(ledger.openCycle.start).toBe("2026-08-02");
    expect(ledger.unbilledSpend).toBe(1291);
    expect(ledger.statementDue).toBe(0);
  });
});
