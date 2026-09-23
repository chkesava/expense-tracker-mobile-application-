import { describe, expect, it } from "vitest";

import type { AccountActivity } from "../types/expense";
import {
  activityToTransactionRef,
  findActivityForRef,
  isJournalKind,
  parseTransactionRouteParams,
  transactionHref,
  type TransactionKind,
} from "./transactionRef";

function activity(overrides: Partial<AccountActivity>): AccountActivity {
  return {
    id: "row",
    date: "2026-09-01",
    amount: 100,
    type: "debit",
    ...overrides,
  };
}

describe("activityToTransactionRef", () => {
  const cases: Array<[Partial<AccountActivity>, TransactionKind, string]> = [
    [{ linkedExpenseId: "e1" }, "expense", "e1"],
    [{ linkedIncomeId: "i1", type: "credit" }, "income", "i1"],
    [{ linkedPaymentId: "p1", isBillPayment: true }, "payment", "p1"],
    [{ linkedPaymentId: "p2", isCashback: true, type: "credit" }, "payment", "p2"],
    [{ linkedTransferId: "t1", isTransfer: true }, "transfer", "t1"],
    [{ linkedAccountEntryId: "a1", isManualEntry: true }, "entry", "a1"],
    [{ linkedBorrowingId: "b1", isBorrowing: true }, "borrowing", "b1"],
    [
      { linkedRepaymentId: "r1", linkedBorrowingId: "b1", isLoanRepayment: true },
      "borrowingRepayment",
      "r1",
    ],
    [{ linkedReceivableId: "rc1", isReceivable: true }, "receivable", "rc1"],
    [
      {
        linkedReceivableRepaymentId: "rr1",
        linkedReceivableId: "rc1",
        isReceivableRepayment: true,
      },
      "receivableRepayment",
      "rr1",
    ],
  ];

  it.each(cases)("maps %o to its source document", (overrides, kind, id) => {
    expect(activityToTransactionRef(activity(overrides))).toEqual({ kind, id });
  });

  it("returns null for a row with no source link", () => {
    expect(activityToTransactionRef(activity({ linkedExpenseId: "  " }))).toBeNull();
  });
});

describe("findActivityForRef", () => {
  it("finds the matching row and ignores other kinds with the same id", () => {
    const rows = [
      activity({ id: "transfer-out-x", linkedTransferId: "x" }),
      activity({ id: "x", linkedExpenseId: "x" }),
    ];
    expect(findActivityForRef(rows, { kind: "expense", id: "x" })?.id).toBe("x");
    expect(findActivityForRef(rows, { kind: "transfer", id: "x" })?.id).toBe(
      "transfer-out-x"
    );
    expect(findActivityForRef(rows, { kind: "income", id: "x" })).toBeUndefined();
  });
});

describe("transaction route helpers", () => {
  it("round-trips a ref and account through href and params", () => {
    const href = transactionHref({ kind: "payment", id: "pay/1" }, "acc-1");
    expect(href).toBe("/transactions/pay%2F1?kind=payment&accountId=acc-1");

    const url = new URL(href, "https://spendly.local");
    const parsed = parseTransactionRouteParams({
      id: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
      kind: url.searchParams.get("kind") ?? undefined,
      accountId: url.searchParams.get("accountId") ?? undefined,
    });
    expect(parsed).toEqual({ ref: { kind: "payment", id: "pay/1" }, accountId: "acc-1" });
  });

  it("omits accountId when there is no account context", () => {
    expect(transactionHref({ kind: "expense", id: "e1" })).toBe(
      "/transactions/e1?kind=expense"
    );
  });

  it("rejects a missing id or an unknown kind", () => {
    expect(parseTransactionRouteParams({ id: "e1", kind: "bogus" })).toBeNull();
    expect(parseTransactionRouteParams({ id: " ", kind: "expense" })).toBeNull();
    expect(parseTransactionRouteParams({ id: ["e1"], kind: ["income"] })).toEqual({
      ref: { kind: "income", id: "e1" },
      accountId: null,
    });
  });

  it("treats only expense and income as journal-editable kinds", () => {
    expect(isJournalKind("expense")).toBe(true);
    expect(isJournalKind("income")).toBe(true);
    expect(isJournalKind("transfer")).toBe(false);
    expect(isJournalKind("payment")).toBe(false);
  });
});
