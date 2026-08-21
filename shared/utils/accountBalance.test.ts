import { describe, expect, it, vi } from "vitest";
import type {
  Account,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type {
  Receivable,
  ReceivableRepayment,
} from "../types/receivable";
import {
  buildAccountActivities,
  computeBankBalance,
  computeOutstandingCredit,
  getCreditBillHistory,
  previewBalanceAfterBillPayment,
  previewBalanceAfterTransaction,
} from "./accountBalance";
import type { OpenCreditBillSlice } from "./accountBalance";

describe("account activity ledger", () => {
  it("shows the final running balance on the first row when same-day activity exists", () => {
    const account: Account = {
      id: "bank-1",
      name: "Bank",
      typeId: "bank-type",
      openingBalance: 1000,
      balanceInitialized: true,
      balanceAsOfDate: "2026-06-01",
    };
    const payments: AccountPayment[] = [
      {
        id: "payment-1",
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 200,
        date: "2026-06-01",
        sourceType: "account",
      },
    ];
    const entries = [
      {
        id: "entry-1",
        accountId: "bank-1",
        amount: 100,
        direction: "debit" as const,
        date: "2026-06-01",
      },
    ];

    const currentBalance = computeBankBalance(account, [], [], payments, entries);
    const activities = buildAccountActivities(
      account,
      "Bank",
      [],
      [],
      payments,
      entries
    );

    expect(currentBalance).toBe(700);
    expect(activities[0]?.runningBalance).toBe(currentBalance);
    expect(activities.map((activity) => activity.id)).toEqual([
      "payment-1",
      "entry-entry-1",
    ]);
  });

  it("moves money between accounts without treating it as income or an expense", () => {
    const cash: Account = {
      id: "cash-1",
      name: "Hand cash",
      typeId: "cash-type",
      openingBalance: 1000,
      balanceInitialized: true,
      balanceAsOfDate: "2026-06-01",
    };
    const bank: Account = {
      id: "bank-1",
      name: "Bank",
      typeId: "bank-type",
      openingBalance: 200,
      balanceInitialized: true,
      balanceAsOfDate: "2026-06-01",
    };
    const transfers: AccountTransfer[] = [{
      id: "transfer-1",
      fromAccountId: "cash-1",
      toAccountId: "bank-1",
      amount: 300,
      date: "2026-06-10",
    }];

    expect(computeBankBalance(cash, [], [], [], [], transfers)).toBe(700);
    expect(computeBankBalance(bank, [], [], [], [], transfers)).toBe(500);

    const cashActivity = buildAccountActivities(
      cash,
      "Cash",
      [],
      [],
      [],
      [],
      transfers,
      { "bank-1": "Bank" }
    )[0];
    const bankActivity = buildAccountActivities(
      bank,
      "Bank",
      [],
      [],
      [],
      [],
      transfers,
      { "cash-1": "Hand cash" }
    )[0];

    expect(cashActivity).toMatchObject({ type: "debit", isTransfer: true, counterpartyName: "Bank" });
    expect(bankActivity).toMatchObject({ type: "credit", isTransfer: true, counterpartyName: "Hand cash" });
  });
});

describe("borrowing effect on account balances", () => {
  const bank: Account = {
    id: "acc-hdfc",
    name: "HDFC Bank",
    typeId: "bank-type",
    openingBalance: 5000,
    balanceInitialized: true,
    balanceAsOfDate: "2026-01-01",
  };

  const borrowing: Borrowing = {
    id: "b1",
    userId: "u1",
    lenderType: "FINANCE_INSTITUTION",
    lenderName: "Super Finance",
    principalAmount: 20000,
    interestRate: 12,
    interestType: "SIMPLE",
    interestFrequency: "ANNUAL",
    interestBasis: "OUTSTANDING_PRINCIPAL",
    borrowedDate: "2026-02-01",
    creditedAccountId: "acc-hdfc",
    status: "ACTIVE",
  };

  const repayment: BorrowingRepayment = {
    id: "r1",
    borrowingId: "b1",
    amount: 10000,
    principalComponent: 10000,
    interestComponent: 0,
    paymentAccountId: "acc-hdfc",
    date: "2026-03-01",
  };

  it("credits borrowed money into the account", () => {
    expect(computeBankBalance(bank, [], [], [], [], [], [borrowing])).toBe(25000);
  });

  it("debits repayments from the paying account", () => {
    expect(
      computeBankBalance(bank, [], [], [], [], [], [borrowing], [repayment])
    ).toBe(15000);
  });

  it("leaves the balance untouched when no borrowings are passed", () => {
    expect(computeBankBalance(bank, [], [])).toBe(5000);
  });

  it("ignores borrowings credited to a different account", () => {
    const elsewhere = { ...borrowing, creditedAccountId: "acc-other" };
    expect(computeBankBalance(bank, [], [], [], [], [], [elsewhere])).toBe(5000);
  });

  it("ignores a borrowing with no credited account", () => {
    const unlinked = { ...borrowing, creditedAccountId: null };
    expect(computeBankBalance(bank, [], [], [], [], [], [unlinked])).toBe(5000);
  });

  it("respects the balance-as-of baseline date", () => {
    const rebased = { ...bank, balanceAsOfDate: "2026-02-15" };
    // Borrowed 1 Feb is before the baseline, the 1 Mar repayment is after it.
    expect(
      computeBankBalance(rebased, [], [], [], [], [], [borrowing], [repayment])
    ).toBe(-5000);
  });

  it("adds a borrowing credit row to the activity feed", () => {
    const activities = buildAccountActivities(
      bank,
      "Bank",
      [],
      [],
      [],
      [],
      [],
      undefined,
      { borrowings: [borrowing], borrowingRepayments: [] }
    );

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "credit",
      amount: 20000,
      isBorrowing: true,
      linkedBorrowingId: "b1",
      counterpartyName: "Super Finance",
    });
  });

  it("adds a repayment debit row flagged as a loan repayment", () => {
    const activities = buildAccountActivities(
      bank,
      "Bank",
      [],
      [],
      [],
      [],
      [],
      undefined,
      { borrowings: [borrowing], borrowingRepayments: [repayment] }
    );

    const repaymentRow = activities.find((a) => a.isLoanRepayment);
    expect(repaymentRow).toMatchObject({
      type: "debit",
      amount: 10000,
      linkedRepaymentId: "r1",
      linkedBorrowingId: "b1",
    });
    // A repayment is never an ordinary expense.
    expect(repaymentRow?.linkedExpenseId).toBeUndefined();
  });

  it("tracks the running balance through borrow then repay", () => {
    const activities = buildAccountActivities(
      bank,
      "Bank",
      [],
      [],
      [],
      [],
      [],
      undefined,
      { borrowings: [borrowing], borrowingRepayments: [repayment] }
    );

    // Newest first: repayment leaves 15000, borrowing left 25000.
    expect(activities[0]?.runningBalance).toBe(15000);
    expect(activities[1]?.runningBalance).toBe(25000);
  });

  it("keeps the activity feed empty when no liabilities are supplied", () => {
    expect(buildAccountActivities(bank, "Bank", [], [])).toHaveLength(0);
  });
});

describe("receivable effect on account balances", () => {
  const bank: Account = {
    id: "acc-hdfc",
    name: "HDFC",
    typeId: "bank",
    openingBalance: 50000,
    balanceAsOfDate: "2026-01-01",
  };

  const receivable: Receivable = {
    id: "rcv1",
    userId: "u1",
    personType: "FRIEND",
    personName: "Rahul",
    originalAmount: 20000,
    lentDate: "2026-02-01",
    sourceAccountId: "acc-hdfc",
    status: "ACTIVE",
  };

  const collection: ReceivableRepayment = {
    id: "rrp1",
    receivableId: "rcv1",
    amount: 8000,
    receivedAccountId: "acc-hdfc",
    date: "2026-03-01",
  };

  it("debits money lent from the source account", () => {
    expect(
      computeBankBalance(bank, [], [], [], [], [], [], [], [receivable])
    ).toBe(30000);
  });

  it("credits collections into the receiving account", () => {
    expect(
      computeBankBalance(
        bank,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [receivable],
        [collection]
      )
    ).toBe(38000);
  });

  it("emits receivable debit and collection credit activity rows", () => {
    const activities = buildAccountActivities(
      bank,
      "Bank",
      [],
      [],
      [],
      [],
      [],
      undefined,
      undefined,
      { receivables: [receivable], receivableRepayments: [collection] }
    );

    expect(activities.find((a) => a.isReceivable)).toMatchObject({
      type: "debit",
      amount: 20000,
      linkedReceivableId: "rcv1",
    });
    expect(activities.find((a) => a.isReceivableRepayment)).toMatchObject({
      type: "credit",
      amount: 8000,
      linkedReceivableRepaymentId: "rrp1",
    });
  });
});

describe("floating-point safety in money math", () => {
  const bank: Account = {
    id: "acc-1",
    name: "Bank",
    typeId: "bank-type",
    openingBalance: 0,
    balanceInitialized: true,
  };

  function expenseOf(
    amount: number,
    date: string,
    accountId = "acc-1"
  ): Expense {
    return {
      amount,
      category: "Food & Dining",
      note: "",
      date,
      month: date.slice(0, 7),
      accountId,
      createdAt: null,
    };
  }

  it("sums decimal expenses without accumulating float residue", () => {
    // 0.1 + 0.2 !== 0.3 in raw JS float math; the balance must still land
    // on an exact 2-decimal value rather than 699.6999999999999-style noise.
    const expenses = [
      expenseOf(0.1, "2026-01-01"),
      expenseOf(0.2, "2026-01-02"),
    ];
    const withOpening: Account = { ...bank, openingBalance: 1 };
    const balance = computeBankBalance(withOpening, expenses, []);
    expect(balance).toBe(0.7);
    expect(Number.isInteger(balance * 100)).toBe(true);
  });

  it("handles a zero-amount expense without changing the balance", () => {
    const expenses = [expenseOf(0, "2026-01-01")];
    const withOpening: Account = { ...bank, openingBalance: 500 };
    expect(computeBankBalance(withOpening, expenses, [])).toBe(500);
  });

  it("handles very large amounts without precision loss at the cent level", () => {
    const withOpening: Account = { ...bank, openingBalance: 10_000_000.5 };
    const expenses = [expenseOf(1_234_567.25, "2026-01-01")];
    expect(computeBankBalance(withOpening, expenses, [])).toBe(8_765_433.25);
  });

  it("reflects an edited transaction amount via previewBalanceAfterTransaction", () => {
    // Simulates editing a 10.10 expense up to 15.75: preview excludes the
    // original row and re-applies the new amount, same pattern the edit
    // modal uses to show "what will my balance be after I save this".
    const withOpening: Account = { ...bank, openingBalance: 100 };
    const original = { ...expenseOf(10.1, "2026-01-05"), id: "exp-1" };
    const preview = previewBalanceAfterTransaction(
      withOpening,
      "Bank",
      [original],
      [],
      "expense",
      15.75,
      [],
      [],
      [],
      "exp-1"
    );
    expect(preview).toBe(84.25);
  });

  it("includes borrowings when previewing the balance after a new expense", () => {
    const withOpening: Account = { ...bank, openingBalance: 600 };
    const borrowing: Borrowing = {
      id: "b-cash",
      userId: "u1",
      lenderType: "FRIEND",
      lenderName: "Ravi",
      principalAmount: 10000,
      interestRate: 0,
      interestType: "SIMPLE",
      interestFrequency: "ONE_TIME",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      borrowedDate: "2026-01-02",
      creditedAccountId: bank.id,
      status: "ACTIVE",
    };
    const preview = previewBalanceAfterTransaction(
      withOpening,
      "Cash",
      [],
      [],
      "expense",
      112,
      [],
      [],
      [],
      undefined,
      [borrowing]
    );
    expect(preview).toBe(10488);
  });

  it("previews remaining credit after an unpaid statement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22));
    try {
      const preview = previewBalanceAfterTransaction(
        {
          id: "slice",
          name: "Slice",
          typeId: "credit-type",
          billGenerationDay: 21,
          creditLimit: 100000,
        },
        "Credit Card",
        [{ ...expenseOf(200, "2026-08-22"), accountId: "slice" }],
        [],
        "expense",
        100,
        [],
        [],
        [],
        undefined,
        [],
        [],
        [],
        [],
        [
          {
            id: "bill-aug",
            accountId: "slice",
            status: "UPCOMING",
            statementAmount: 17764,
            amountPaid: 0,
            statementDate: "2026-08-21",
            billingPeriodStart: "2026-07-22",
            billingPeriodEnd: "2026-08-21",
          },
        ]
      );
      expect(preview).toBe(99700);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes a deleted transaction's effect on the running balance", () => {
    const withOpening: Account = { ...bank, openingBalance: 100 };
    const kept = { ...expenseOf(20, "2026-01-01"), id: "exp-keep" };
    const deleted = { ...expenseOf(30, "2026-01-02"), id: "exp-delete" };
    // After deletion the app simply stops passing the deleted row in.
    const balanceAfterDelete = computeBankBalance(withOpening, [kept], []);
    expect(balanceAfterDelete).toBe(80);
  });

  it("keeps a credit card cycle marked paid when float noise would otherwise leave a residue", () => {
    const card: Account = {
      id: "card-1",
      name: "Credit Card",
      typeId: "credit-type",
      billGenerationDay: 1,
      creditLimit: 50000,
    };
    // 0.1 + 0.2 is the textbook JS float case: it sums to
    // 0.30000000000000004, not exactly 0.3. Paid off with a single payment
    // for the exact nominal amount, this must still resolve to "paid".
    expect(0.1 + 0.2).not.toBe(0.3); // sanity check the repro is real
    const expenses: Expense[] = [
      expenseOf(0.1, "2026-01-05", "card-1"),
      expenseOf(0.2, "2026-01-06", "card-1"),
    ];
    const payments: AccountPayment[] = [
      {
        id: "pay-1",
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 0.3,
        date: "2026-02-01",
        sourceType: "account",
      },
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // 15 Mar 2026 — a couple cycles after the payment
    try {
      const history = getCreditBillHistory(card, expenses, payments, 3);
      const paidCycle = history.find((c) => c.billedAmount > 0);
      expect(paidCycle?.status).toBe("paid");
      expect(paidCycle?.outstandingAmount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("computes credit usage for decimal charges without a stray fractional cent", () => {
    const card: Account = {
      id: "card-1",
      name: "Credit Card",
      typeId: "credit-type",
      billGenerationDay: 1,
      creditLimit: 1000,
    };
    const expenses: Expense[] = [
      expenseOf(33.33, "2026-01-05", "card-1"),
      expenseOf(33.33, "2026-01-06", "card-1"),
      expenseOf(33.34, "2026-01-07", "card-1"),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 20));
    try {
      const usage = computeOutstandingCredit(card, expenses, []);
      expect(usage.usedThisCycle).toBe(100);
      expect(usage.availableCredit).toBe(900);
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries explicit expense clock time onto the activity without changing the ledger", () => {
    const account: Account = {
      id: "bank-1",
      name: "Bank",
      typeId: "bank-type",
      openingBalance: 16452,
      balanceInitialized: true,
      balanceAsOfDate: "2026-08-16",
    };
    const expenses: Expense[] = [
      {
        id: "exp-gym",
        amount: 1600,
        category: "Health",
        note: "[Subscription] GYM PERSONAL TRAINER",
        date: "2026-08-16",
        month: "2026-08",
        accountId: "bank-1",
        time: "20:12",
        createdAt: null,
      },
    ];
    const activities = buildAccountActivities(account, "Bank", expenses, []);
    expect(activities[0]?.time).toBe("08:12 PM");
    expect(activities[0]?.runningBalance).toBe(14852);
    expect(activities[0]?.category).toBe("Health");
  });

  it("sorts same-day rows by clock time, not credit-before-debit, and keeps running balances", () => {
    const account: Account = {
      id: "bank-1",
      name: "Bank",
      typeId: "bank-type",
      openingBalance: 1000,
      balanceInitialized: true,
      balanceAsOfDate: "2026-08-20",
    };
    const expenses: Expense[] = [
      {
        id: "exp-morning",
        amount: 200,
        category: "Food",
        note: "Breakfast",
        date: "2026-08-20",
        month: "2026-08",
        accountId: "bank-1",
        time: "08:00",
        createdAt: "2026-08-20T08:00:00",
      },
    ];
    const incomes: Income[] = [
      {
        id: "inc-evening",
        amount: 500,
        source: "UPI",
        note: "Mom gave money",
        date: "2026-08-20",
        month: "2026-08",
        accountId: "bank-1",
        time: "21:00",
        createdAt: "2026-08-20T21:00:00",
      },
    ];

    const activities = buildAccountActivities(account, "Bank", expenses, incomes);
    expect(activities.map((row) => row.note)).toEqual([
      "Mom gave money",
      "Breakfast",
    ]);
    // Newest first: evening income leaves 1300, morning expense left 800.
    expect(activities[0]?.runningBalance).toBe(1300);
    expect(activities[1]?.runningBalance).toBe(800);
  });
});

describe("computeOutstandingCredit", () => {
  const card: Account = {
    id: "slice",
    name: "Slice",
    typeId: "credit-type",
    billGenerationDay: 21,
    creditLimit: 100000,
  };

  function expenseOf(amount: number, date: string): Expense {
    return {
      amount,
      category: "Shopping",
      note: "",
      date,
      month: date.slice(0, 7),
      accountId: "slice",
      createdAt: null,
    };
  }

  /** Statement for the closed 22 Jul → 21 Aug window. */
  function openBill(overrides: Partial<OpenCreditBillSlice> = {}): OpenCreditBillSlice {
    return {
      id: "bill-aug",
      accountId: "slice",
      status: "UPCOMING",
      statementAmount: 18264,
      amountPaid: 0,
      statementDate: "2026-08-21",
      billingPeriodStart: "2026-07-22",
      billingPeriodEnd: "2026-08-21",
      ...overrides,
    };
  }

  const cycleExpenses: Expense[] = [
    expenseOf(17764, "2026-08-10"),
    expenseOf(500, "2026-08-21"),
    expenseOf(200, "2026-08-22"),
  ];

  it("keeps an unpaid statement in outstanding and bills the close date only once", () => {
    const result = computeOutstandingCredit(
      card,
      cycleExpenses,
      [],
      [openBill()],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(18264);
    expect(result.unbilledSpend).toBe(200);
    expect(result.totalOutstanding).toBe(18464);
    expect(result.availableCredit).toBe(99800);
  });

  it("drops the statement from outstanding once the bill is paid", () => {
    const result = computeOutstandingCredit(
      card,
      cycleExpenses,
      [],
      [openBill({ status: "PAID", amountPaid: 18264 })],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(0);
    expect(result.unbilledSpend).toBe(200);
    expect(result.totalOutstanding).toBe(200);
  });

  it("resets the cycle to zero on the close date and keeps the statement due", () => {
    const result = computeOutstandingCredit(
      card,
      [expenseOf(17764, "2026-08-10"), expenseOf(500, "2026-08-21")],
      [],
      [openBill()],
      "2026-08-21"
    );
    expect(result.usedThisCycle).toBe(0);
    expect(result.unbilledSpend).toBe(0);
    expect(result.totalOutstanding).toBe(18264);
  });

  it("uses the settled amount for a partial payment plus later unbilled spend", () => {
    const result = computeOutstandingCredit(
      card,
      [expenseOf(17764, "2026-08-10"), expenseOf(200, "2026-08-22")],
      [],
      [
        openBill({
          status: "PARTIALLY_PAID",
          statementAmount: 17764,
          amountPaid: 13764,
        }),
      ],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(4000);
    expect(result.unbilledSpend).toBe(200);
    expect(result.totalOutstanding).toBe(4200);
  });

  it("does not let a statement payment wipe later unbilled spend", () => {
    const payments: AccountPayment[] = [
      {
        id: "pay-statement",
        fromAccountId: "bank-1",
        toAccountId: "slice",
        amount: 18264,
        date: "2026-08-22",
      },
    ];
    const result = computeOutstandingCredit(
      card,
      cycleExpenses,
      payments,
      [
        openBill({
          status: "PAID",
          amountPaid: 18264,
          paymentIds: ["pay-statement"],
        }),
      ],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(0);
    expect(result.unbilledSpend).toBe(200);
    expect(result.totalOutstanding).toBe(200);
  });

  it("settles a statement from an unlinked payment made after it closed", () => {
    const payments: AccountPayment[] = [
      {
        id: "pay-legacy",
        fromAccountId: "bank-1",
        toAccountId: "slice",
        amount: 18264,
        date: "2026-08-22",
      },
    ];
    const result = computeOutstandingCredit(
      card,
      cycleExpenses,
      payments,
      [openBill()],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(0);
    expect(result.unbilledSpend).toBe(200);
  });

  it("keeps closed-cycle spend in outstanding after the statement is cancelled", () => {
    const result = computeOutstandingCredit(
      card,
      cycleExpenses,
      [],
      [openBill({ status: "CANCELLED", amountPaid: 0 })],
      "2026-08-22"
    );
    expect(result.statementDue).toBe(0);
    expect(result.totalOutstanding).toBe(18464);
  });
});
