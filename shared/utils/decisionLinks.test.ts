import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "../types/expense";
import {
  accountLinkLabel,
  addLink,
  linkFromAccount,
  linkFromExpense,
  linkFromIncome,
  removeLink,
  searchLinkableTransactions,
  transactionLinkLabel,
} from "./decisionLinks";
import { validateDecision, newDecisionDraft } from "./decisionModel";

const account: Account = { id: "hdfc", name: "HDFC Savings", typeId: "t", last4: "4321", accountNumber: "50100012344321" };
const exp = (id: string, note: string, date: string, amount = 100, over: Partial<Expense> = {}): Expense & { id: string } => ({
  id, amount, note, category: "Shopping & Clothing", date, month: date.slice(0, 7), createdAt: 1, ...over,
});
const inc = (id: string, note: string, date: string): Income & { id: string } => ({ id, amount: 90000, note, source: "Salary", date, month: date.slice(0, 7), createdAt: 1 });

describe("link builders", () => {
  it("build references with display-only captured values", () => {
    const l = linkFromExpense(exp("e1", "Laptop from Croma", "2026-09-12", 74999.5), "L1", 5);
    expect(l).toEqual({ id: "L1", kind: "transaction", refId: "e1", refKind: "expense", capturedLabel: "Laptop from Croma · 2026-09-12", capturedAmount: 74999.5, capturedAtMs: 5 });
    expect(linkFromIncome(inc("i1", "Sept salary", "2026-09-01"), "L2", 5)).toMatchObject({ refKind: "income", refId: "i1" });
    expect(linkFromAccount(account, "L3", 5)).toEqual({ id: "L3", kind: "account", refId: "hdfc", capturedLabel: "HDFC Savings ••4321", capturedAtMs: 5 });
  });

  it("produce links the model accepts", () => {
    const d = { ...newDecisionDraft({ id: "d", title: "t", category: "purchase", nowMs: 1 }), links: [linkFromAccount(account, "L", 1), linkFromExpense(exp("e", "x", "2026-09-01"), "M", 1)] };
    expect(validateDecision(d)).toEqual([]);
  });

  it("never expose more than four digits of a number", () => {
    expect(accountLinkLabel({ name: "Old", last4: "50100012344321" })).toBe("Old ••4321");
    expect(transactionLinkLabel({ note: "NEFT 50100012344321 to Ravi", date: "2026-09-01" })).toBe("NEFT ••4321 to Ravi · 2026-09-01");
    expect(transactionLinkLabel({ note: "x".repeat(300), date: "2026-09-01" }).length).toBeLessThanOrEqual(120);
  });
});

describe("adding and removing", () => {
  it("dedupes the same record and removes only the reference", () => {
    const a = linkFromAccount(account, "L1", 1);
    const links = addLink(addLink([], a), { ...a, id: "L2" });
    expect(links).toHaveLength(1);
    expect(removeLink(links, "L1")).toEqual([]);
    expect(account.id).toBe("hdfc");
  });

  it("caps the number of links", () => {
    let links = [] as ReturnType<typeof addLink>;
    for (let i = 0; i < 40; i++) links = addLink(links, { id: `L${i}`, kind: "account", refId: `a${i}`, capturedLabel: "x", capturedAtMs: 1 });
    expect(links).toHaveLength(30);
  });
});

describe("searchLinkableTransactions", () => {
  const expenses = [exp("e1", "Laptop from Croma", "2026-09-12"), exp("e2", "Groceries", "2026-09-20"), exp("e3", "Old", "2026-01-01", 5, { deletedAt: "x" })];
  const incomes = [inc("i1", "Sept salary", "2026-09-01")];

  it("finds by note, category, source and amount, newest first, without deleted rows", () => {
    expect(searchLinkableTransactions(expenses, incomes, "").map((r) => r.row.id)).toEqual(["e2", "e1", "i1"]);
    expect(searchLinkableTransactions(expenses, incomes, "croma").map((r) => r.row.id)).toEqual(["e1"]);
    expect(searchLinkableTransactions(expenses, incomes, "salary").map((r) => r.row.id)).toEqual(["i1"]);
    expect(searchLinkableTransactions(expenses, incomes, "90000").map((r) => r.row.id)).toEqual(["i1"]);
    expect(searchLinkableTransactions(expenses, incomes, "old")).toEqual([]);
  });

  it("limits results", () => {
    const many = Array.from({ length: 100 }, (_, i) => exp(`m${i}`, "x", "2026-09-01"));
    expect(searchLinkableTransactions(many, [], "", 30)).toHaveLength(30);
  });
});
