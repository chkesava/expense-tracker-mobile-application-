import { describe, expect, it } from "vitest";
import type { Account, Expense, Income } from "../types/expense";
import { computeBankBalance } from "./accountBalance";
import {
  baselineAwareBalanceDeltas,
  type AccountDelta,
  type BalanceAccountContext,
} from "./ledgerAccountDeltas";

const TODAY = "2026-10-24";

const accounts: Record<string, Account & BalanceAccountContext> = {
  plain: { id: "plain", name: "Plain", typeId: "bank", openingBalance: 1000, isCreditCard: false },
  based: {
    id: "based",
    name: "Based",
    typeId: "bank",
    openingBalance: 5000,
    balanceAsOfDate: "2026-09-10",
    isCreditCard: false,
  },
  card: { id: "card", name: "Card", typeId: "card", balanceAsOfDate: "2026-09-10", isCreditCard: true },
};
const context = (id: string) => accounts[id];

const expense = (id: string, accountId: string, amount: number, date: string): Expense => ({
  id,
  amount,
  category: "Food",
  note: "",
  date,
  month: date.slice(0, 7),
  accountId,
  createdAt: null,
});
const income = (id: string, accountId: string, amount: number, date: string): Income =>
  ({ id, amount, source: "Salary", date, month: date.slice(0, 7), accountId, note: "" }) as Income;

/** The legs a journal writer emits when replacing `before` with `after`. */
function legsFor(before: (Expense | Income)[], after: (Expense | Income)[]): AccountDelta[] {
  const sign = (row: Expense | Income) => ("category" in row ? -1 : 1);
  return [
    ...before.map((r) => ({ accountId: r.accountId ?? "", amountDelta: -sign(r) * r.amount, date: r.date })),
    ...after.map((r) => ({ accountId: r.accountId ?? "", amountDelta: sign(r) * r.amount, date: r.date })),
  ];
}

describe("baselineAwareBalanceDeltas (SPENDLY-602)", () => {
  it("keeps every leg on an account with no baseline", () => {
    expect(
      baselineAwareBalanceDeltas([{ accountId: "plain", amountDelta: -100, date: "2020-01-01" }], context, TODAY)
    ).toEqual([{ accountId: "plain", amountDelta: -100 }]);
  });

  it("drops bank legs dated before the baseline and keeps the baseline day itself", () => {
    expect(
      baselineAwareBalanceDeltas(
        [
          { accountId: "based", amountDelta: -100, date: "2026-09-09" },
          { accountId: "based", amountDelta: -40, date: "2026-09-10" },
        ],
        context,
        TODAY
      )
    ).toEqual([{ accountId: "based", amountDelta: -40 }]);
  });

  it("keeps credit-card legs whatever their date", () => {
    expect(
      baselineAwareBalanceDeltas([{ accountId: "card", amountDelta: -100, date: "2026-01-01" }], context, TODAY)
    ).toEqual([{ accountId: "card", amountDelta: -100 }]);
  });

  it("ignores a baseline of today or later, as the balance readers do", () => {
    const future = () => ({ isCreditCard: false, balanceAsOfDate: "2026-12-01" });
    expect(
      baselineAwareBalanceDeltas([{ accountId: "x", amountDelta: 50, date: "2026-01-01" }], future, TODAY)
    ).toEqual([{ accountId: "x", amountDelta: 50 }]);
  });

  it("keeps legs on unknown accounts and drops empty ids and zero nets", () => {
    expect(
      baselineAwareBalanceDeltas(
        [
          { accountId: "ghost", amountDelta: 10, date: "2026-01-01" },
          { accountId: "", amountDelta: 99, date: "2026-10-01" },
          { accountId: "plain", amountDelta: 30, date: "2026-10-01" },
          { accountId: "plain", amountDelta: -30, date: "2026-10-02" },
        ],
        context,
        TODAY
      )
    ).toEqual([{ accountId: "ghost", amountDelta: 10 }]);
  });

  describe("matches a full rebuild (computeBankBalance) for every journal write", () => {
    const scenarios: { name: string; before: (Expense | Income)[]; after: (Expense | Income)[] }[] = [
      { name: "create after baseline", before: [], after: [expense("e", "based", 120, "2026-09-20")] },
      { name: "create before baseline", before: [], after: [expense("e", "based", 120, "2026-09-01")] },
      { name: "create income before baseline", before: [], after: [income("i", "based", 75, "2026-08-01")] },
      {
        name: "edit amount before baseline",
        before: [expense("e", "based", 120, "2026-09-01")],
        after: [expense("e", "based", 80, "2026-09-01")],
      },
      {
        name: "edit date across baseline (forward)",
        before: [expense("e", "based", 120, "2026-09-01")],
        after: [expense("e", "based", 80, "2026-09-15")],
      },
      {
        name: "edit date across baseline (backward)",
        before: [expense("e", "based", 120, "2026-09-15")],
        after: [expense("e", "based", 80, "2026-09-01")],
      },
      {
        name: "move between accounts",
        before: [expense("e", "plain", 120, "2026-09-01")],
        after: [expense("e", "based", 120, "2026-09-01")],
      },
      { name: "delete after baseline", before: [income("i", "based", 75, "2026-10-01")], after: [] },
      { name: "delete before baseline", before: [expense("e", "based", 120, "2026-09-09")], after: [] },
    ];

    const balance = (account: Account, rows: (Expense | Income)[]) =>
      computeBankBalance(
        account,
        rows.filter((r): r is Expense => "category" in r),
        rows.filter((r): r is Income => !("category" in r)),
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        TODAY
      );

    for (const { name, before, after } of scenarios) {
      it(name, () => {
        const deltas = baselineAwareBalanceDeltas(legsFor(before, after), context, TODAY);
        for (const id of ["plain", "based"]) {
          const expected = balance(accounts[id], after) - balance(accounts[id], before);
          const got = deltas.find((d) => d.accountId === id)?.amountDelta ?? 0;
          expect(got).toBeCloseTo(expected, 2);
        }
      });
    }
  });
});
