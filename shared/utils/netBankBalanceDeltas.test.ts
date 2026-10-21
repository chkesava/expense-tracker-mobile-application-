import { describe, expect, it } from "vitest";

import type { Account } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { computeBankBalance } from "./accountBalance";
import { netBankBalanceDeltas, type BalanceAccountContext, type LedgerRow } from "./ledgerAccountDeltas";
import { roundMoney } from "./money";

const TODAY = "2026-10-15";

const ACCOUNTS: Record<string, Account & BalanceAccountContext> = {
  "bank-1": { id: "bank-1", name: "Bank 1", typeId: "t", openingBalance: 1000, isCreditCard: false } as Account & BalanceAccountContext,
  // Rows before 2026-10-05 are already inside this account's opening balance.
  "bank-2": { id: "bank-2", name: "Bank 2", typeId: "t", openingBalance: 500, balanceAsOfDate: "2026-10-05", isCreditCard: false } as Account & BalanceAccountContext,
  "card-1": { id: "card-1", name: "Card", typeId: "c", openingBalance: 0, isCreditCard: true } as Account & BalanceAccountContext,
};
const context = (id: string) => ACCOUNTS[id];

const borrowing = (over: Partial<Borrowing>): LedgerRow => ({
  kind: "borrowing",
  row: { id: "b", principalAmount: 0, borrowedDate: "2026-10-01", creditedAccountId: "bank-1", ...over } as Borrowing,
});
const receivable = (over: Partial<Receivable>): LedgerRow => ({
  kind: "receivable",
  row: { id: "r", originalAmount: 0, lentDate: "2026-10-01", sourceAccountId: "bank-1", ...over } as Receivable,
});

describe("netBankBalanceDeltas (SPENDLY-496)", () => {
  it("credits a borrowing and debits money lent", () => {
    expect(netBankBalanceDeltas([], [borrowing({ principalAmount: 300 })], context, TODAY)).toEqual([
      { accountId: "bank-1", amountDelta: 300 },
    ]);
    expect(netBankBalanceDeltas([], [receivable({ originalAmount: 200 })], context, TODAY)).toEqual([
      { accountId: "bank-1", amountDelta: -200 },
    ]);
  });

  it("an edit moves only the difference, and across accounts moves both", () => {
    const before = borrowing({ principalAmount: 300 });
    expect(netBankBalanceDeltas([before], [borrowing({ principalAmount: 450 })], context, TODAY)).toEqual([
      { accountId: "bank-1", amountDelta: 150 },
    ]);
    expect(
      netBankBalanceDeltas([before], [borrowing({ principalAmount: 300, creditedAccountId: "bank-2", borrowedDate: "2026-10-10" })], context, TODAY)
    ).toEqual([
      { accountId: "bank-1", amountDelta: -300 },
      { accountId: "bank-2", amountDelta: 300 },
    ]);
  });

  it("a cascade delete reverses the parent and every repayment", () => {
    const repayments: LedgerRow[] = [
      { kind: "borrowingRepayment", row: { id: "p1", borrowingId: "b", amount: 100, date: "2026-10-03", paymentAccountId: "bank-1" } as BorrowingRepayment },
      { kind: "borrowingRepayment", row: { id: "p2", borrowingId: "b", amount: 50, date: "2026-10-04", paymentAccountId: "bank-1" } as BorrowingRepayment },
    ];
    expect(netBankBalanceDeltas([borrowing({ principalAmount: 300 }), ...repayments], [], context, TODAY)).toEqual([
      { accountId: "bank-1", amountDelta: -150 },
    ]);
  });

  it("skips credit cards, rows before the account's baseline, and unchanged edits", () => {
    expect(netBankBalanceDeltas([], [borrowing({ principalAmount: 300, creditedAccountId: "card-1" })], context, TODAY)).toEqual([]);
    expect(
      netBankBalanceDeltas([], [borrowing({ principalAmount: 300, creditedAccountId: "bank-2", borrowedDate: "2026-10-04" })], context, TODAY)
    ).toEqual([]);
    const row = borrowing({ principalAmount: 300 });
    expect(netBankBalanceDeltas([row], [row], context, TODAY)).toEqual([]);
    expect(netBankBalanceDeltas([], [borrowing({ principalAmount: 300, creditedAccountId: "unknown" })], context, TODAY)).toEqual([]);
  });

  it("random debt-ledger edits keep stored balances equal to computeBankBalance", () => {
    let seed = 496;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const accountIds = ["bank-1", "bank-2", "card-1", undefined];
    const dates = ["2026-10-01", "2026-10-04", "2026-10-05", "2026-10-09", "2026-10-14"];

    for (let run = 0; run < 30; run++) {
      const stored: Record<string, number> = { "bank-1": 1000, "bank-2": 500 };
      const rows = new Map<string, LedgerRow>();
      const apply = (before: LedgerRow[], after: LedgerRow[]) => {
        for (const d of netBankBalanceDeltas(before, after, context, TODAY)) {
          stored[d.accountId] = roundMoney((stored[d.accountId] ?? 0) + d.amountDelta);
        }
      };
      const makeRow = (id: string): LedgerRow => {
        const amount = (rand(100_000) + 1) / 100;
        const accountId = accountIds[rand(accountIds.length)] as string;
        const date = dates[rand(dates.length)];
        switch (rand(4)) {
          case 0:
            return { kind: "borrowing", row: { id, principalAmount: amount, borrowedDate: date, creditedAccountId: accountId } as Borrowing };
          case 1:
            return { kind: "borrowingRepayment", row: { id, borrowingId: "b", amount, date, paymentAccountId: accountId } as BorrowingRepayment };
          case 2:
            return { kind: "receivable", row: { id, originalAmount: amount, lentDate: date, sourceAccountId: accountId } as Receivable };
          default:
            return { kind: "receivableRepayment", row: { id, receivableId: "r", amount, date, receivedAccountId: accountId } as ReceivableRepayment };
        }
      };

      for (let step = 0; step < 50; step++) {
        const ids = [...rows.keys()];
        const action = ids.length === 0 ? 0 : rand(3);
        if (action === 0) {
          const row = makeRow(`x${run}-${step}`);
          rows.set(row.row.id!, row);
          apply([], [row]);
        } else {
          const id = ids[rand(ids.length)];
          const before = rows.get(id)!;
          if (action === 1) {
            // An edit keeps the kind and takes new amount/account/date fields.
            const fresh = makeRow(id);
            const merged = { kind: before.kind, row: { ...before.row, ...fresh.row, id } } as LedgerRow;
            rows.set(id, merged);
            apply([before], [merged]);
          } else {
            rows.delete(id);
            apply([before], []);
          }
        }
      }

      const of = <K extends LedgerRow["kind"]>(kind: K) =>
        [...rows.values()].filter((r) => r.kind === kind).map((r) => r.row) as Extract<LedgerRow, { kind: K }>["row"][];
      for (const id of ["bank-1", "bank-2"]) {
        const expected = computeBankBalance(
          ACCOUNTS[id],
          [],
          [],
          [],
          [],
          [],
          of("borrowing"),
          of("borrowingRepayment"),
          of("receivable"),
          of("receivableRepayment"),
          TODAY
        );
        expect(stored[id]).toBe(expected);
      }
    }
  });
});
