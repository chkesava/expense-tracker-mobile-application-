import { describe, expect, it } from "vitest";
import {
  getAccountKind,
  isBankAccount,
  isCreditAccount,
} from "./accountKind";

describe("accountKind", () => {
  it("classifies credit accounts", () => {
    expect(getAccountKind("Credit Card")).toBe("credit");
    expect(getAccountKind("Amazon ICICI Credit")).toBe("credit");
    expect(isCreditAccount("Credit Card")).toBe(true);
    expect(isBankAccount("Credit Card")).toBe(false);
  });

  it("classifies bank-like accounts", () => {
    expect(getAccountKind("HDFC Bank")).toBe("bank");
    expect(getAccountKind("Savings")).toBe("bank");
    expect(getAccountKind("Checking")).toBe("bank");
    expect(getAccountKind("Debit card")).toBe("bank");
    expect(isBankAccount("Savings")).toBe(true);
  });

  it("falls back to other", () => {
    expect(getAccountKind("Cash wallet")).toBe("other");
    expect(getAccountKind("")).toBe("other");
  });
});
