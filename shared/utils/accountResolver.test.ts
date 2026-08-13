import { describe, expect, it } from "vitest";

import type { Account } from "../types/expense";
import { resolveAccountFromSms } from "./accountResolver";

function creditCard(overrides: Partial<Account> & Pick<Account, "id">): Account {
  return {
    name: "Super Money Credit Card",
    typeId: "type-cc",
    displayName: "Super Money Credit Card",
    institutionId: "super_money",
    accountTypeId: "credit_card",
    last4: "4521",
    smsMatchingEnabled: true,
    ...overrides,
  };
}

function bankAccount(overrides: Partial<Account> & Pick<Account, "id">): Account {
  return {
    name: "HDFC Bank",
    typeId: "type-bank",
    displayName: "HDFC Bank",
    institutionId: "hdfc",
    accountTypeId: "bank",
    last4: "7788",
    smsMatchingEnabled: true,
    ...overrides,
  };
}

const SUPER_CARD_SMS = {
  sender: "VM-SUPER",
  body: "Super Card transaction of Rs.899 card ending 4521",
  accountLast4: "4521",
  paymentMethod: "CARD",
};

describe("resolveAccountFromSms", () => {
  it("auto-matches Super Card + last4 to the exact credit card account", () => {
    const account = creditCard({ id: "acc-super-cc" });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [account]);

    expect(result).toMatchObject({
      accountId: "acc-super-cc",
      institutionId: "super_money",
      accountTypeId: "credit_card",
      status: "AUTO_MATCHED",
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.matchedSignals).toEqual(
      expect.arrayContaining(["last4", "institutionId", "product", "accountTypeId"])
    );
    expect(result.accountId).toBe(account.id);
  });

  it("does not change or use displayName as the match key", () => {
    const account = creditCard({
      id: "acc-super-cc",
      displayName: "Travel card",
      name: "Travel card",
    });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [account]);
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.accountId).toBe("acc-super-cc");
    expect(result.matchedSignals).not.toContain("displayName");
  });

  it("never matches by displayName alone", () => {
    const account = creditCard({
      id: "acc-nick",
      displayName: "Grocery nick",
      name: "Grocery nick",
      institutionId: undefined,
      last4: undefined,
    });
    const result = resolveAccountFromSms(
      { body: "Grocery nick spent Rs.899" },
      [account]
    );
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.accountId).toBeNull();
  });

  it("never invents an accountId that is not in the user's accounts", () => {
    const result = resolveAccountFromSms(SUPER_CARD_SMS, []);
    expect(result.accountId).toBeNull();
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("does not auto-match on bank/institution name alone", () => {
    const account = bankAccount({ id: "acc-hdfc" });
    const result = resolveAccountFromSms(
      {
        sender: "VK-HDFCBK",
        body: "INR 120 spent at Zomato via UPI",
        paymentMethod: "UPI",
      },
      [account]
    );
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.accountId).toBeNull();
    expect(result.institutionId).toBe("hdfc");
  });

  it("auto-matches a bank SMS when last4 and institution agree", () => {
    const account = bankAccount({ id: "acc-hdfc", last4: "7788" });
    const result = resolveAccountFromSms(
      {
        sender: "AX-HDFCBK",
        body: "Your A/c XX7788 has been debited for Rs.450 towards Swiggy via UPI",
        accountLast4: "7788",
        paymentMethod: "UPI",
      },
      [account]
    );
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.accountId).toBe("acc-hdfc");
    expect(result.accountTypeId).toBe("bank");
  });

  it("resolves credit-card SMS to the credit-card account, not a bank", () => {
    const card = creditCard({ id: "acc-super-cc", last4: "4521" });
    const bank = bankAccount({
      id: "acc-super-bank",
      institutionId: "super_money",
      last4: "4521",
      name: "Super Money Bank",
    });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [bank, card]);
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.accountId).toBe("acc-super-cc");
    expect(result.accountTypeId).toBe("credit_card");
  });

  it("does not resolve a bank SMS onto a credit-card account", () => {
    const card = creditCard({ id: "acc-hdfc-cc", institutionId: "hdfc", last4: "7788" });
    const result = resolveAccountFromSms(
      {
        sender: "AX-HDFCBK",
        body: "Your A/c XX7788 has been debited for Rs.450 towards Swiggy via UPI",
        accountLast4: "7788",
        paymentMethod: "UPI",
      },
      [card]
    );
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.accountId).toBeNull();
  });

  it("returns AMBIGUOUS when two accounts share institution, type, and last4", () => {
    const a = creditCard({ id: "acc-a", last4: "4521" });
    const b = creditCard({ id: "acc-b", last4: "4521", displayName: "Backup card" });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [a, b]);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.accountId).toBeNull();
  });

  it("picks the account whose last4 matches when two cards share an institution", () => {
    const a = creditCard({ id: "acc-4521", last4: "4521" });
    const b = creditCard({ id: "acc-9999", last4: "9999", displayName: "Other Super" });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [a, b]);
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.accountId).toBe("acc-4521");
  });

  it("skips accounts without a catalog institution even if last4 matches", () => {
    const account = creditCard({
      id: "acc-legacy",
      institutionId: undefined,
      last4: "4521",
    });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [account]);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.accountId).toBeNull();
  });

  it("skips accounts with SMS matching disabled", () => {
    const account = creditCard({ id: "acc-off", smsMatchingEnabled: false });
    const result = resolveAccountFromSms(SUPER_CARD_SMS, [account]);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.accountId).toBeNull();
  });

  it("is deterministic for the same SMS and accounts", () => {
    const accounts = [
      bankAccount({ id: "acc-hdfc" }),
      creditCard({ id: "acc-super-cc" }),
    ];
    const first = resolveAccountFromSms(SUPER_CARD_SMS, accounts);
    const second = resolveAccountFromSms(SUPER_CARD_SMS, accounts);
    expect(second).toEqual(first);
  });
});
