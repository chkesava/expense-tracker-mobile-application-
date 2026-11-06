import { describe, expect, it } from "vitest";

import { emptyGroupFundTotals } from "./groupFundModel";
import { summarizeGroupFundsHeld } from "./groupFundMath";
import { composeNetWorth, type NetWorthInputs } from "./netWorth";
import { snapshotBlockers } from "./netWorthHistory";
import { buildRunwaySources, type RunwaySourcesInput } from "./runwaySources";

/**
 * SPENDLY-686 (AC4, AC5, AC11): money held for others stays in the real
 * account balances but comes out of personal net worth and runway, as its own
 * line. Without Group Funds every figure is exactly what it was before.
 */

const typeMap = new Map([
  ["t-bank", "Savings Bank"],
  ["t-cash", "Cash"],
  ["t-other", "Broker Float"],
]);
const account = (id: string, typeId: string, balance: number) =>
  ({ id, name: id, typeId, openingBalance: balance, currentBalance: balance, createdAt: "2026-01-01T00:00:00.000Z" }) as unknown as NetWorthInputs["accounts"][number];

function inputs(over: Partial<RunwaySourcesInput> = {}): RunwaySourcesInput {
  return {
    // ₹61,000 of Dokra money arrived: ₹60,000 in HDFC and ₹1,000 in cash.
    accounts: [account("hdfc", "t-bank", 100_000), account("cash", "t-cash", 6_000), account("float", "t-other", 20_000)],
    typeMap,
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
    borrowingOutstanding: 10_000,
    receivableOutstanding: 0,
    investments: [],
    holdings: [],
    quotes: new Map(),
    investmentCashBalance: 0,
    epfValue: 0,
    epfUnreconciledCount: 0,
    today: "2026-11-06",
    displayCurrency: "INR",
    overrides: [],
    ...over,
  };
}

const fund = (held: number, heldByAccount: Record<string, number>) => ({
  totals: { ...emptyGroupFundTotals(), contributions: held, held },
  heldByAccount,
});

describe("summarizeGroupFundsHeld", () => {
  it("sums stored totals and per-account amounts across funds", () => {
    expect(summarizeGroupFundsHeld([fund(60_000, { hdfc: 60_000 }), fund(1_000, { cash: 1_000 }), fund(0.1, { hdfc: 0.1 })])).toEqual({
      held: 61_000.1,
      heldByAccount: { hdfc: 60_000.1, cash: 1_000 },
    });
    expect(summarizeGroupFundsHeld([])).toEqual({ held: 0, heldByAccount: {} });
  });
});

describe("net worth (AC4, AC5)", () => {
  it("is unchanged when there are no group funds (or the caller has none)", () => {
    const before = composeNetWorth(inputs());
    const withZero = composeNetWorth(inputs({ groupFundHeld: 0 }));
    expect(withZero).toEqual(before);
    expect(before.groupFundLiabilities).toBe(0);
    expect(before.groupFundsHeldUnknown).toBe(false);
  });

  it("keeps the bank balance real and subtracts the held money as its own liability", () => {
    const before = composeNetWorth(inputs());
    const after = composeNetWorth(inputs({ groupFundHeld: 61_000 }));
    expect(after.liquidBankAssets).toBe(before.liquidBankAssets);
    expect(after.groupFundLiabilities).toBe(61_000);
    expect(after.totalLiabilities).toBe(before.totalLiabilities + 61_000);
    expect(after.totalNetWorth).toBe(before.totalNetWorth - 61_000);
    expect(after.totalNetWorth).toBe(after.totalAssets - after.totalLiabilities);
  });

  it("flags unknown instead of treating unloaded funds as zero, and blocks the history point", () => {
    const unknown = composeNetWorth(inputs({ groupFundHeld: null }));
    expect(unknown.groupFundsHeldUnknown).toBe(true);
    expect(unknown.groupFundLiabilities).toBe(0);
    expect(
      snapshotBlockers({
        isDuress: false,
        isOnline: true,
        loading: false,
        untrustedBalanceAccounts: 0,
        groupFundsHeldUnknown: unknown.groupFundsHeldUnknown,
        totalNetWorth: unknown.totalNetWorth,
        totalAssets: unknown.totalAssets,
        totalLiabilities: unknown.totalLiabilities,
      })
    ).toEqual(["groupFundsUnknown"]);
  });

  it("never turns a negative held total into an asset", () => {
    expect(composeNetWorth(inputs({ groupFundHeld: -5 })).groupFundLiabilities).toBe(0);
  });
});

describe("runway (money held for others isn't spendable)", () => {
  it("is unchanged without group funds", () => {
    const s = buildRunwaySources(inputs());
    expect(s.resources.some((r) => r.kind === "group_funds_held")).toBe(false);
    expect(s.liquidTotal).toBe(106_000);
  });

  it("takes the held money out of the counted total, as a locked line", () => {
    const s = buildRunwaySources(inputs({ groupFundHeld: 61_000, groupFundHeldByAccount: { hdfc: 60_000, cash: 1_000 } }));
    const line = s.resources.find((r) => r.kind === "group_funds_held");
    expect(line).toMatchObject({
      label: "Held for others",
      amount: -61_000,
      included: true,
      overridable: false,
      reasons: ["held_for_others_deducted"],
    });
    expect(s.counted).toContainEqual(line);
    expect(s.liquidTotal).toBe(106_000 - 61_000);
  });

  it("doesn't take out money that sits in an account runway doesn't count", () => {
    // ₹20,000 of it sits in an unrecognised account (not counted), the rest in HDFC.
    const s = buildRunwaySources(inputs({ groupFundHeld: 61_000, groupFundHeldByAccount: { hdfc: 41_000, float: 20_000 } }));
    expect(s.resources.find((r) => r.kind === "group_funds_held")?.amount).toBe(-41_000);
    // The user excluding HDFC means none of its held money is taken out either.
    const excluded = buildRunwaySources(
      inputs({
        groupFundHeld: 61_000,
        groupFundHeldByAccount: { hdfc: 41_000, float: 20_000 },
        overrides: [{ kind: "bank", refId: "hdfc", included: false }],
      })
    );
    expect(excluded.resources.some((r) => r.kind === "group_funds_held")).toBe(false);
  });

  it("opening money with no account is still taken out", () => {
    const s = buildRunwaySources(inputs({ groupFundHeld: 5_000, groupFundHeldByAccount: {} }));
    expect(s.resources.find((r) => r.kind === "group_funds_held")?.amount).toBe(-5_000);
  });
});
