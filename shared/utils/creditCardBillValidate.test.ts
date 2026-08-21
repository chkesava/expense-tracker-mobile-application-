import { describe, expect, it } from "vitest";

import type { Account, AccountType } from "../types/expense";
import {
  validateCreateCreditCardBillInput,
  validateCreditCardBillAccount,
} from "./creditCardBillValidate";

const types: AccountType[] = [
  { id: "t-credit", name: "Credit Card" },
  { id: "t-bank", name: "Bank Account" },
];

const accounts: Account[] = [
  { id: "cc1", name: "HDFC", typeId: "t-credit" },
  { id: "bank1", name: "HDFC Bank", typeId: "t-bank" },
];

describe("validateCreditCardBillAccount", () => {
  it("accepts credit accounts", () => {
    expect(validateCreditCardBillAccount("cc1", accounts, types)).toEqual({
      ok: true,
    });
  });

  it("rejects bank accounts", () => {
    const r = validateCreditCardBillAccount("bank1", accounts, types);
    expect(r.ok).toBe(false);
  });

  it("rejects missing accounts", () => {
    const r = validateCreditCardBillAccount("missing", accounts, types);
    expect(r.ok).toBe(false);
  });
});

describe("validateCreateCreditCardBillInput", () => {
  const base = {
    accountId: "cc1",
    statementAmount: 8450,
    minimumDueAmount: 850,
    statementDate: "2026-08-01",
    dueDate: "2026-08-21",
  };

  it("accepts a valid bill", () => {
    expect(validateCreateCreditCardBillInput(base, accounts, types)).toEqual({
      ok: true,
    });
  });

  it("rejects due before statement", () => {
    const r = validateCreateCreditCardBillInput(
      { ...base, dueDate: "2026-07-01" },
      accounts,
      types
    );
    expect(r.ok).toBe(false);
  });

  it("rejects minimum above statement", () => {
    const r = validateCreateCreditCardBillInput(
      { ...base, minimumDueAmount: 9000 },
      accounts,
      types
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a second bill for the same statement date", () => {
    const r = validateCreateCreditCardBillInput(base, accounts, types, [
      {
        accountId: "cc1",
        statementDate: "2026-08-01",
        status: "UPCOMING",
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("allows recreating a cancelled statement date", () => {
    const r = validateCreateCreditCardBillInput(base, accounts, types, [
      {
        accountId: "cc1",
        statementDate: "2026-08-01",
        status: "CANCELLED",
      },
    ]);
    expect(r.ok).toBe(true);
  });
});
