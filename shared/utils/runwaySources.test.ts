import { describe, expect, it } from "vitest";

import { composeNetWorth, type NetWorthInputs } from "./netWorth";
import { classifyResource, isOverridableKind, runwayOverrideId } from "./runwayContract";
import { buildRunwaySources, type RunwaySourcesInput } from "./runwaySources";
import { RUNWAY_RESOURCE_KINDS } from "../types/runway";

const typeMap = new Map([
  ["t-bank", "Savings Bank"],
  ["t-cash", "Cash"],
  ["t-card", "Credit Card"],
  ["t-other", "Broker Float"],
]);

const account = (id: string, typeId: string, balance: number, currency?: string) =>
  ({ id, name: id, typeId, openingBalance: balance, currentBalance: balance, currentOutstanding: balance, currency, createdAt: "2026-01-01T00:00:00.000Z" }) as unknown as NetWorthInputs["accounts"][number];

const fd = (id: string, principal: number, status = "active") =>
  ({ id, name: id, kind: "fixed_deposit", principal, startDate: "2026-09-01", annualInterestRate: 0, status }) as unknown as NetWorthInputs["investments"][number];

function input(over: Partial<RunwaySourcesInput> = {}): RunwaySourcesInput {
  return {
    accounts: [account("hdfc", "t-bank", 80000), account("wallet-cash", "t-cash", 5000), account("card", "t-card", 0), account("float", "t-other", 20000)],
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
    borrowingOutstanding: 150000,
    receivableOutstanding: 12000,
    investments: [fd("fd1", 100000), fd("old", 50000, "closed")],
    holdings: [{ yahooSymbol: "X", quantity: 10, averageBuyPrice: 100 } as unknown as NetWorthInputs["holdings"][number]],
    quotes: new Map(),
    investmentCashBalance: 3000,
    epfValue: 400000,
    epfUnreconciledCount: 2,
    today: "2026-10-02",
    displayCurrency: "INR",
    overrides: [],
    ...over,
  };
}

const byRef = (s: ReturnType<typeof buildRunwaySources>, refId: string) => s.resources.find((r) => r.refId === refId)!;

describe("runway sources", () => {
  it("counts only bank and cash by default and reconciles with their balances", () => {
    const s = buildRunwaySources(input());
    expect(s.counted.map((r) => r.refId).sort()).toEqual(["hdfc", "wallet-cash"]);
    expect(s.liquidTotal).toBe(85000);
  });

  it("matches the net-worth figures for every source it reports", () => {
    const i = input();
    const s = buildRunwaySources(i);
    const nw = composeNetWorth(i);
    const sum = (kinds: string[]) => s.resources.filter((r) => kinds.includes(r.kind)).reduce((t, r) => t + r.amount, 0);
    expect(sum(["bank", "cash", "wallet", "other_account"])).toBe(nw.liquidBankAssets);
    expect(sum(["fixed_deposit", "interest_savings", "mutual_fund"])).toBe(nw.investmentsValue);
    expect(sum(["demat_cash", "stocks"])).toBe(nw.totalStocksValue);
    expect(byRef(s, "epf").amount).toBe(nw.epfValue);
    expect(byRef(s, "receivables").amount).toBe(nw.receivableAssets);
    expect(byRef(s, "borrowings").amount).toBe(nw.borrowingLiabilities);
  });

  it("never counts cards or loans as resources", () => {
    const s = buildRunwaySources(input());
    expect(s.obligations.map((r) => r.kind).sort()).toEqual(["borrowing", "credit_card"]);
    expect(s.obligations.every((r) => !r.included)).toBe(true);
  });

  it("keeps restricted and unknown resources out of the total", () => {
    const s = buildRunwaySources(input());
    expect(byRef(s, "epf")).toMatchObject({ included: false, liquidity: "restricted", overridable: false });
    expect(byRef(s, "holdings")).toMatchObject({ included: false, liquidity: "restricted" });
    expect(byRef(s, "float")).toMatchObject({ kind: "other_account", included: false, overridable: true });
    expect(byRef(s, "epf").provenance.certainty).toBe("estimated");
    expect(s.resources.find((r) => r.refId === "old")).toBeUndefined();
  });

  it("applies overrides to overridable kinds only", () => {
    const s = buildRunwaySources(
      input({
        overrides: [
          { kind: "fixed_deposit", refId: "fd1", included: true },
          { kind: "other_account", refId: "float", included: true },
          { kind: "bank", refId: "hdfc", included: false },
          { kind: "epf", refId: "epf", included: true },
          { kind: "credit_card", refId: "card", included: true },
        ],
      })
    );
    expect(byRef(s, "fd1")).toMatchObject({ included: true, reasons: ["near_liquid_excluded", "user_included"] });
    expect(byRef(s, "hdfc")).toMatchObject({ included: false, reasons: ["liquid_by_default", "user_excluded"] });
    expect(byRef(s, "epf").included).toBe(false);
    expect(byRef(s, "card").included).toBe(false);
    expect(s.liquidTotal).toBe(5000 + 100000 + 20000);
  });

  it("an override cannot count an account in another currency", () => {
    const s = buildRunwaySources(
      input({ accounts: [account("usd", "t-bank", 1000, "USD")], overrides: [{ kind: "bank", refId: "usd", included: true }] })
    );
    expect(byRef(s, "usd")).toMatchObject({ included: false });
    expect(byRef(s, "usd").reasons).toContain("currency_unsupported");
  });

  it("reflects account changes on recompute", () => {
    const before = buildRunwaySources(input()).liquidTotal;
    const after = buildRunwaySources(input({ accounts: [account("hdfc", "t-bank", 1000)] })).liquidTotal;
    expect(before).toBe(85000);
    expect(after).toBe(1000);
  });
});

describe("override rules", () => {
  it("locks EPF, stocks, receivables, cards and loans", () => {
    const locked = RUNWAY_RESOURCE_KINDS.filter((k) => !isOverridableKind(k)).sort();
    expect(locked).toEqual(["borrowing", "credit_card", "epf", "receivable", "stocks"]);
  });

  it("ignores an override that matches the default", () => {
    const r = classifyResource({
      kind: "bank",
      refId: "a",
      label: "a",
      amount: 1,
      displayCurrency: "INR",
      override: { included: true },
      provenance: { source: "t", asOf: "2026-10-02", certainty: "actual" },
    });
    expect(r.reasons).toEqual(["liquid_by_default"]);
  });

  it("builds a stable, path-safe override id", () => {
    expect(runwayOverrideId("fixed_deposit", "abc")).toBe("fixed_deposit__abc");
    expect(runwayOverrideId("bank", "a/b")).toBe("bank__a_b");
  });
});
