import { describe, expect, it } from "vitest";

import type { Account, AccountEntry } from "../types/expense";
import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import type { MutationOp } from "../types/mutations";
import { enrichAccountActivities } from "./accountActivityFilters";
import { buildAccountActivities, computeBankBalance } from "./accountBalance";
import { summarizeAccountMonth } from "./accountMonthSummary";
import { groupFundMonthSummary, reconcileGroupFund, summarizeGroupFundsHeld } from "./groupFundMath";
import { emptyGroupFundTotals } from "./groupFundModel";
import {
  buildAccountMove,
  buildContribution,
  buildPayout,
  buildPurposeTransfer,
  buildReversal,
  groupFundWritePlanToOps,
  type GroupFundWritePlan,
  type GroupFundWriteResult,
} from "./groupFundWrites";
import { composeNetWorth, type NetWorthInputs } from "./netWorth";

/**
 * SPENDLY-688 — the Group Funds QA suite (AC12), end to end over the pure
 * layer: every write is built by the real builders, applied the way the batch
 * lands (fund increments, events, account entries and balance legs), and
 * checked against the account ledger, net worth, analytics and the month view.
 *
 * The storage-level guarantees are proven elsewhere and referenced here:
 * - a replayed batch is refused (create-only events): firestore/groupFunds.rules.test.ts;
 * - a queued batch that already landed is dropped via its ack: lib/commitMutations.test.ts;
 * - the same submit always builds the same batch: services/groupFunds/groupFundStore.test.ts.
 */

type Ledger = {
  fund: GroupFund;
  events: GroupFundEvent[];
  entries: AccountEntry[];
  balances: Record<string, number>;
  ops: MutationOp[];
};

const S = { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) };
const round = (v: number) => Math.round(v * 100) / 100;

function start(): Ledger {
  return {
    fund: {
      id: "dokra",
      name: "Dokra",
      status: "active",
      startPeriod: "2026-10",
      purposes: [
        { id: "appu", name: "Appu loan", cadence: "monthly", expectedPerMember: 6000 },
        { id: "podupu", name: "Podupu", cadence: "monthly", expectedPerMember: 100 },
      ],
      members: Array.from({ length: 10 }, (_, i) => ({ id: `m${i + 1}`, name: `Member ${i + 1}` })),
      totals: emptyGroupFundTotals(),
      byPurpose: {},
      heldByAccount: {},
      version: 1,
    },
    events: [],
    entries: [],
    balances: { hdfc: 100_000, cash: 2_000 },
    ops: [],
  };
}

function apply(l: Ledger, result: GroupFundWriteResult): GroupFundWritePlan {
  if (!result.ok) throw new Error(result.issues.join(","));
  const plan = result.plan;
  const fund = structuredClone(l.fund) as unknown as Record<string, unknown>;
  for (const [path, delta] of Object.entries(plan.increments)) {
    const parts = path.split(".");
    let cursor = fund;
    for (const part of parts.slice(0, -1)) {
      cursor[part] = (cursor[part] as Record<string, unknown>) ?? {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    cursor[last] = round(((cursor[last] as number) ?? 0) + delta);
  }
  Object.assign(fund, plan.fields);
  l.fund = fund as unknown as GroupFund;
  l.events.push(...plan.events);
  l.entries.push(...plan.accountEntries.map((e) => ({ ...e })));
  for (const leg of plan.balanceLegs) l.balances[leg.accountId] = round((l.balances[leg.accountId] ?? 0) + leg.amountDelta);
  l.ops.push(...groupFundWritePlanToOps("u1", plan, S));
  return plan;
}

const ctx = (eventId: string) => ({ uid: "u1", nowMs: Number(eventId.replace(/\D/g, "")) || 1, eventId });

function account(id: string, opening: number): Account {
  return { id, name: id, typeId: "bank", openingBalance: opening, balanceInitialized: true, balanceAsOfDate: "2026-10-01" } as Account;
}

function netWorth(l: Ledger, held: number | null) {
  return composeNetWorth({
    accounts: Object.entries(l.balances).map(([id, bal]) => ({ ...account(id, 0), currentBalance: bal })),
    typeMap: new Map([["bank", "Savings Bank"]]),
    expenses: [],
    incomes: [],
    payments: [],
    bills: [],
    entries: [],
    transfers: [],
    borrowings: [],
    borrowingRepayments: [],
    receivables: [],
    receivableRepayments: [],
    borrowingOutstanding: 0,
    receivableOutstanding: 0,
    investments: [],
    holdings: [],
    quotes: new Map(),
    investmentCashBalance: 0,
    epfValue: 0,
    epfUnreconciledCount: 0,
    groupFundHeld: held,
    today: "2026-11-30",
  } as NetWorthInputs);
}

/** The month from the ticket: ten members pay ₹6,000 + ₹100, into HDFC or cash; one is late. */
function november(l: Ledger) {
  for (let i = 1; i <= 10; i++) {
    const accountId = i <= 7 ? "hdfc" : "cash";
    if (i !== 10) {
      apply(l, buildContribution(ctx(`a${i}`), l.fund, { purposeId: "appu", memberId: `m${i}`, amount: 6000, date: "2026-11-05", accountId }));
    } else {
      // Partial collection: member 10 pays half.
      apply(l, buildContribution(ctx(`a${i}`), l.fund, { purposeId: "appu", memberId: `m${i}`, amount: 3000, date: "2026-11-05", accountId }));
    }
    apply(l, buildContribution(ctx(`p${i}`), l.fund, { purposeId: "podupu", memberId: `m${i}`, amount: 100, date: "2026-11-05", accountId }));
  }
}

describe("Group Funds QA (AC12)", () => {
  it("collection: each contribution raises the receiving account exactly once, never income", () => {
    const l = start();
    november(l);
    expect(l.balances.hdfc).toBe(100_000 + 7 * 6100);
    expect(l.balances.cash).toBe(2_000 + 2 * 6100 + 3100);
    expect(l.fund.totals).toMatchObject({ contributions: 58_000, held: 58_000 });
    // The account ledger rebuilt from entries agrees with the stored-balance legs.
    expect(computeBankBalance(account("hdfc", 100_000), [], [], [], l.entries.filter((e) => e.accountId === "hdfc"))).toBe(l.balances.hdfc);
    expect(reconcileGroupFund(l.fund, l.events)).toEqual([]);
  });

  it("split purposes keep separate balances", () => {
    const l = start();
    november(l);
    expect(l.fund.byPurpose.appu.held).toBe(57_000);
    expect(l.fund.byPurpose.podupu.held).toBe(1_000);
  });

  it("multiple accounts: held money is tracked per account", () => {
    const l = start();
    november(l);
    expect(l.fund.heldByAccount).toEqual({ hdfc: 42_700, cash: 15_300 });
    expect(summarizeGroupFundsHeld([l.fund]).heldByAccount).toEqual({ hdfc: 42_700, cash: 15_300 });
  });

  it("partial collection shows in the month view", () => {
    const l = start();
    november(l);
    const [appu, podupu] = groupFundMonthSummary(l.fund, l.events, "2026-11");
    expect(appu).toMatchObject({ paidCount: 9, expected: 60_000, collected: 57_000, pending: 3_000 });
    expect(appu.rows.find((r) => r.memberId === "m10")).toMatchObject({ state: "partial", pending: 3000 });
    expect(podupu).toMatchObject({ paidCount: 10, pending: 0 });
    // October (the start month) has nobody paid yet; September is before the fund.
    expect(groupFundMonthSummary(l.fund, [], "2026-10")[0]).toMatchObject({ paidCount: 0, pending: 60_000 });
    expect(groupFundMonthSummary(l.fund, [], "2026-09")).toEqual([]);
  });

  it("payout: reduces the paying account and the pool exactly once, never an expense", () => {
    const l = start();
    november(l);
    apply(l, buildAccountMove(ctx("mv1"), l.fund, { purposeId: "appu", fromAccountId: "cash", toAccountId: "hdfc", amount: 15_000, date: "2026-11-20" }));
    apply(l, buildPayout(ctx("pay1"), l.fund, { purposeId: "appu", amount: 57_000, date: "2026-11-30", accountId: "hdfc", recipient: "Dokra centre" }));
    expect(l.balances.hdfc).toBe(100_000 + 42_700 + 15_000 - 57_000);
    expect(l.balances.cash).toBe(2_000 + 15_300 - 15_000);
    expect(l.fund.totals).toMatchObject({ payouts: 57_000, held: 1_000 });
    expect(reconcileGroupFund(l.fund, l.events)).toEqual([]);
  });

  it("reversal: undoes the money and the account effect, and keeps the original", () => {
    const l = start();
    november(l);
    const original = l.events.find((e) => e.id === "a1")!;
    apply(l, buildReversal(ctx("x1"), l.fund, { target: original, knownEvents: l.events, date: "2026-11-07" }));
    expect(l.events.map((e) => e.id)).toContain("a1");
    expect(l.balances.hdfc).toBe(100_000 + 6 * 6100 + 100);
    expect(groupFundMonthSummary(l.fund, l.events, "2026-11")[0].rows.find((r) => r.memberId === "m1")).toMatchObject({ state: "unpaid" });
    expect(buildReversal(ctx("x2"), l.fund, { target: original, knownEvents: l.events, date: "2026-11-07" })).toMatchObject({
      ok: false,
      issues: ["already_reversed"],
    });
    expect(reconcileGroupFund(l.fund, l.events)).toEqual([]);
  });

  it("purpose transfer moves money between purposes without changing any account", () => {
    const l = start();
    november(l);
    const before = { ...l.balances };
    apply(l, buildPurposeTransfer(ctx("t1"), l.fund, { fromPurposeId: "podupu", toPurposeId: "appu", amount: 500, date: "2026-11-25" }));
    expect(l.balances).toEqual(before);
    expect(l.fund.totals.held).toBe(58_000);
    expect(l.fund.byPurpose.podupu.held).toBe(500);
  });

  it("retry / idempotency: the same submit builds the same documents; a different submit can't reuse its ids", () => {
    const a = start();
    const b = start();
    apply(a, buildContribution(ctx("same"), a.fund, { purposeId: "appu", memberId: "m1", amount: 6000, date: "2026-11-05", accountId: "hdfc" }));
    apply(b, buildContribution(ctx("same"), b.fund, { purposeId: "appu", memberId: "m1", amount: 6000, date: "2026-11-05", accountId: "hdfc" }));
    expect(b.ops).toEqual(a.ops);
    expect(a.ops.map((o) => o.ref.path)).toEqual([
      "users/u1/groupFunds/dokra",
      "users/u1/groupFundEvents/same",
      "users/u1/accountEntries/gf_same",
    ]);
  });

  it("net worth excludes the held money; account balances stay real", () => {
    const l = start();
    const before = netWorth(l, 0);
    november(l);
    const after = netWorth(l, summarizeGroupFundsHeld([l.fund]).held);
    expect(after.liquidBankAssets).toBe(before.liquidBankAssets + 58_000);
    expect(after.groupFundLiabilities).toBe(58_000);
    expect(after.totalNetWorth).toBe(before.totalNetWorth);
    expect(netWorth(l, null).groupFundsHeldUnknown).toBe(true);
  });

  it("analytics stay untouched: no expense, income, summary, budget or transfer writes; no income or spending on accounts", () => {
    const l = start();
    november(l);
    apply(l, buildPayout(ctx("pay1"), l.fund, { purposeId: "appu", amount: 40_000, date: "2026-11-30", accountId: "hdfc" }));
    for (const op of l.ops) {
      expect(op.ref.path).not.toMatch(/\/(expenses|incomes|financialSummaries|categoryBudgets|accountTransfers|ledgerEvents)\//);
    }
    const hdfc = account("hdfc", 100_000);
    const entries = l.entries.filter((e) => e.accountId === "hdfc");
    const records = enrichAccountActivities(buildAccountActivities(hdfc, "Bank", [], [], [], entries), [], [], entries);
    const month = summarizeAccountMonth(records, "2026-11");
    expect(month.income).toBe(0);
    expect(month.expenses).toBe(0);
    expect(records.every((r) => r.kind === "transfers")).toBe(true);
  });
});
