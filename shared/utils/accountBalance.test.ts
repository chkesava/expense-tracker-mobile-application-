import { describe, expect, it } from "vitest";
import type { Account, AccountPayment, AccountTransfer } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import { buildAccountActivities, computeBankBalance } from "./accountBalance";

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
