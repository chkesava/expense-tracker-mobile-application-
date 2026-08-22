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
    expect(ledger.unappliedCredit).toBe(19000);
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
    expect(ledger.unappliedCredit).toBe(7497);
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
    expect(ledger.unappliedCredit).toBe(0);
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
    expect(ledger.unappliedCredit).toBe(2000);
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
    expect(ledger.unappliedCredit).toBe(8699);
    expect(ledger.availableCredit).toBe(89000 - 1500);
    // The 8,699 advance is already paid, so it is not owed a second time.
    expect(ledger.totalOutstanding).toBe(27875 + 1500 - 8699);
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
    expect(ledger.unappliedCredit).toBe(0);
  });

  it("holds carried credit as a balance rather than discounting new spend", () => {
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
    expect(ledger.unappliedCredit).toBe(7497);
    expect(ledger.availableCredit).toBe(89000 - 393);
    // 28,101 statement + 393 unbilled, less the 7,497 already paid in advance.
    expect(ledger.totalOutstanding).toBe(20997);
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
    expect(ledger.unappliedCredit).toBe(0);
  });
});

/**
 * Money already paid to the card is not owed a second time. The bank balance
 * has already dropped by the full payment, so leaving an advance out of
 * `totalOutstanding` understated net worth by exactly that amount.
 */
describe("buildCreditCardLedger — an advance is netted out of outstanding", () => {
  it("nets an advance out of what the card owes", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-07-15", 11503), expense("2026-08-10", 28101)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    // The July statement took 11,503; the rest is an advance.
    expect(ledger.statementDue).toBe(28101);
    expect(ledger.unappliedCredit).toBe(7497);
    expect(ledger.totalOutstanding).toBe(28101 - 7497);
  });

  it("never reports negative outstanding when the advance exceeds the debt", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-07-15", 1000)],
      payments: [payment("pay-big", "2026-08-22", 9000)],
      bills: [],
      today: "2026-08-22",
    });

    expect(ledger.unappliedCredit).toBe(8000);
    expect(ledger.totalOutstanding).toBe(0);
  });

  it("keeps outstanding equal to the debt when nothing was overpaid", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-10", 28101), expense("2026-08-25", 500)],
      payments: [],
      bills: [],
      today: "2026-08-26",
    });

    expect(ledger.unappliedCredit).toBe(0);
    expect(ledger.totalOutstanding).toBe(28601);
  });

  it("nets the advance against cancelled statement spend too", () => {
    const ledger = buildCreditCardLedger({
      account: slice,
      expenses: [expense("2026-08-05", 6000)],
      payments: [payment("pay-1", "2026-08-26", 9000)],
      bills: [
        statement("2026-08-20", "2026-07-21", 6000, { status: "CANCELLED" }),
      ],
      today: "2026-08-26",
    });

    // 6,000 of the payment clears the cancelled spend; 3,000 is an advance and
    // there is nothing left to owe.
    expect(ledger.cancelledSpend).toBe(0);
    expect(ledger.unappliedCredit).toBe(3000);
    expect(ledger.totalOutstanding).toBe(0);
  });

  it("leaves availableCredit on the unbilled rule, not the advance", () => {
    const ledger = buildCreditCardLedger({
      account: { ...slice, billGenerationDay: 21 },
      expenses: [expense("2026-07-15", 11503), expense("2026-08-10", 28101), expense("2026-08-22", 393)],
      payments: [payment("pay-aug-13", "2026-08-13", 19000)],
      bills: [],
      today: "2026-08-22",
    });

    // The advance does not hand back limit — only this cycle's spend moves it.
    expect(ledger.availableCredit).toBe(89000 - 393);
    expect(ledger.unbilledSpend).toBe(393);
  });
});

/**
 * A stored window may not reach outside the cycle it closes. Statements written
 * before the close-on-D fix used the *previous* generation day as their start
 * instead of the day after, so consecutive windows shared that boundary day —
 * and spend on it was billed in both statements. The tell in the UI is a cycle
 * that reads "1 Jul → 1 Aug": 32 days, both ends on a generation day.
 */
describe("buildCreditCardLedger — a stored window cannot overlap its neighbour", () => {
  const firstOfMonth: Account = { ...slice, billGenerationDay: 1, creditLimit: 35000 };
  const spend = (date: string, amount: number): Expense => ({
    amount,
    category: "Food",
    note: "",
    date,
    month: date.slice(0, 7),
    accountId: firstOfMonth.id,
    createdAt: null,
  });

  const legacyBill = (overrides: Partial<LedgerBillSlice> = {}): LedgerBillSlice => ({
    id: "bill-legacy",
    accountId: firstOfMonth.id,
    statementDate: "2026-08-01",
    // Off by one: the old code used the previous generation day, not the day after.
    billingPeriodStart: "2026-07-01",
    billingPeriodEnd: "2026-08-01",
    statementAmount: 1656,
    amountPaid: 0,
    status: "OVERDUE",
    note: AUTO_CREDIT_CARD_BILL_NOTE,
    ...overrides,
  });

  it("clamps a legacy start that would share the previous close date", () => {
    const ledger = buildCreditCardLedger({
      account: firstOfMonth,
      expenses: [spend("2026-07-01", 500), spend("2026-07-15", 1000), spend("2026-08-01", 156)],
      payments: [],
      bills: [legacyBill()],
      today: "2026-08-22",
    });

    const august = ledger.statements.find((s) => s.statementDate === "2026-08-01");
    expect(august?.periodStart).toBe("2026-07-02");
    expect(august?.periodEnd).toBe("2026-08-01");
  });

  it("never bills the boundary day in two statements", () => {
    const expenses = [
      spend("2026-07-01", 500),
      spend("2026-07-15", 1000),
      spend("2026-08-01", 156),
      spend("2026-08-03", 190),
    ];
    const ledger = buildCreditCardLedger({
      account: firstOfMonth,
      expenses,
      payments: [],
      // No stored amount to defer to, so the windows themselves decide.
      bills: [legacyBill({ statementAmount: 0, status: "UPCOMING" })],
      today: "2026-08-22",
    });

    const covering = ledger.statements.filter(
      (s) => "2026-07-01" >= s.periodStart && "2026-07-01" <= s.periodEnd
    );
    expect(covering).toHaveLength(1);
    expect(covering[0].statementDate).toBe("2026-07-01");
  });

  it("clamps a stored end that would run past its own close date", () => {
    const ledger = buildCreditCardLedger({
      account: firstOfMonth,
      expenses: [spend("2026-08-03", 190)],
      payments: [],
      bills: [legacyBill({ billingPeriodEnd: "2026-08-10", statementAmount: 0 })],
      today: "2026-08-22",
    });

    const august = ledger.statements.find((s) => s.statementDate === "2026-08-01");
    expect(august?.periodEnd).toBe("2026-08-01");
    // The 3 Aug spend stays in the open cycle rather than being pulled back.
    expect(ledger.unbilledSpend).toBe(190);
  });

  it("keeps a deliberately narrower stored window", () => {
    const ledger = buildCreditCardLedger({
      account: firstOfMonth,
      expenses: [spend("2026-07-05", 800), spend("2026-07-20", 300)],
      payments: [],
      bills: [
        legacyBill({
          billingPeriodStart: "2026-07-10",
          billingPeriodEnd: "2026-08-01",
          statementAmount: 0,
        }),
      ],
      today: "2026-08-22",
    });

    const august = ledger.statements.find((s) => s.statementDate === "2026-08-01");
    expect(august?.periodStart).toBe("2026-07-10");
  });

  it("spend charged on the generation day belongs to the statement closing then", () => {
    const ledger = buildCreditCardLedger({
      account: firstOfMonth,
      expenses: [
        spend("2026-08-01", 156),
        spend("2026-08-03", 190),
        spend("2026-08-21", 129),
      ],
      payments: [],
      bills: [],
      today: "2026-08-22",
    });

    expect(ledger.openCycle.start).toBe("2026-08-02");
    // 156 closed with the 1 Aug statement; only the later two are unbilled.
    expect(ledger.unbilledSpend).toBe(319);
    expect(
      ledger.statements.find((s) => s.statementDate === "2026-08-01")?.billed
    ).toBe(156);
  });
});
