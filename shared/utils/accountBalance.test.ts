import { describe, expect, it } from "vitest";
import type { Account, AccountPayment, AccountTransfer } from "../types/expense";
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
