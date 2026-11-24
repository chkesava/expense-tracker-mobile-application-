import { describe, expect, it } from "vitest";
import type { Investment } from "../../shared/types/investment";
import { computeInterestValuation } from "../../shared/utils/investmentInterest";
import { planFdInterestWrites } from "./fdInterestDailyCore";

function fd(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "fd1",
    name: "Test FD",
    kind: "fixed_deposit",
    principal: 100000,
    startDate: "2026-01-01",
    annualInterestRate: 7.25,
    interestMethod: "compound",
    creditFrequency: "quarterly",
    status: "active",
    ...overrides,
  };
}

function valuationDelta(investment: Investment, from: string, to: string): number {
  const base = (asOf: string) =>
    computeInterestValuation(
      investment.principal,
      investment.annualInterestRate!,
      "compound",
      "daily",
      investment.startDate,
      asOf
    ).totalValue;
  return Math.round((base(to) - base(from)) * 100) / 100;
}

describe("planFdInterestWrites", () => {
  it("credits nothing on the FD's own start day", () => {
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: fd() }],
      "2026-01-01"
    );
    expect(writes).toEqual([]);
    expect(credited).toBe(0);
  });

  it("credits just one day's growth when already up to date through yesterday", () => {
    const investment = fd({ lastInterestCreditedDate: "2026-01-09" });
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: investment }],
      "2026-01-10"
    );
    expect(credited).toBe(1);
    const expectedAmount = valuationDelta(investment, "2026-01-09", "2026-01-10");

    const logWrite = writes.find((w) => w.path === "users/u1/investments/fd1/interestCredits/2026-01-10");
    expect(logWrite).toMatchObject({ kind: "set", data: { date: "2026-01-10", amount: expectedAmount } });
    expect(writes.filter((w) => w.kind === "set")).toHaveLength(1);

    const accountWrite = writes.find((w) => w.path === "users/u1/investments/fd1");
    expect(accountWrite).toMatchObject({ kind: "update", data: { lastInterestCreditedDate: "2026-01-10" } });
  });

  it("backfills every missed day instead of folding the gap into one lump entry", () => {
    // No lastInterestCreditedDate at all: first-ever run, 9 days after start.
    const investment = fd();
    const { writes } = planFdInterestWrites("u1", [{ id: "fd1", data: investment }], "2026-01-10");
    const logWrites = writes.filter((w) => w.kind === "set");
    // One entry per day from 01-02 through 01-10.
    expect(logWrites.map((w) => w.path).sort()).toEqual(
      [
        "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06",
        "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10",
      ].map((d) => `users/u1/investments/fd1/interestCredits/${d}`)
    );
    for (const w of logWrites) {
      expect((w.data as { amount: number }).amount).toBeGreaterThan(0);
    }
    // The total credited across every entry is within a rounding cent of the
    // single-shot delta from start to today — backfilling never meaningfully
    // changes the total, only the day-by-day breakdown of it (each day's
    // amount rounds independently, so a few cents of drift is expected).
    const total = logWrites.reduce((sum, w) => sum + (w.data as { amount: number }).amount, 0);
    expect(total).toBeCloseTo(valuationDelta(investment, "2026-01-01", "2026-01-10"), 1);
  });

  it("caps backfill at 60 days so a very old first run doesn't blow the batch limit", () => {
    const investment = fd({ startDate: "2025-01-01" });
    const { writes } = planFdInterestWrites("u1", [{ id: "fd1", data: investment }], "2026-06-01");
    const logWrites = writes.filter((w) => w.kind === "set");
    expect(logWrites.length).toBeLessThanOrEqual(60);
    // The most recent day is still covered.
    expect(writes.some((w) => w.path === "users/u1/investments/fd1/interestCredits/2026-06-01")).toBe(true);
  });

  it("backfills up to maturity, then stops crediting growth past it", () => {
    const investment = fd({ maturityDate: "2026-01-15" });
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: investment }],
      "2026-02-01"
    );
    expect(credited).toBe(1);
    const dates = writes.filter((w) => w.kind === "set").map((w) => w.path.split("/").pop());
    expect(Math.max(...dates!.map((d) => new Date(d!).getTime()))).toBe(new Date("2026-01-15").getTime());
    const accountWrite = writes.find((w) => w.path === "users/u1/investments/fd1");
    expect(accountWrite).toMatchObject({ data: { lastInterestCreditedDate: "2026-01-15" } });
  });

  it("does nothing once already credited through today", () => {
    const investment = fd({ lastInterestCreditedDate: "2026-01-10" });
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: investment }],
      "2026-01-10"
    );
    expect(writes).toEqual([]);
    expect(credited).toBe(0);
  });

  it("recalibrates the whole history at the corrected rate after an interest-rate edit", () => {
    // The app's rate-edit flow writes { annualInterestRate: newRate,
    // lastInterestCreditedDate: null } -- this is the only trigger a rate
    // edit needs. The job has no memory of an "old rate": every day's
    // amount is recomputed fresh from computeInterestValuation using
    // whatever rate is currently on the document, so clearing
    // lastInterestCreditedDate re-walks the whole history at the (now
    // corrected) rate, not just the days going forward.
    const corrected = fd({ annualInterestRate: 9.5, lastInterestCreditedDate: null });
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: corrected }],
      "2026-01-10"
    );
    expect(credited).toBe(1);
    const logWrites = writes.filter((w) => w.kind === "set");
    expect(logWrites).toHaveLength(9); // 01-02 through 01-10
    const expectedTotal = valuationDelta(corrected, "2026-01-01", "2026-01-10");
    const actualTotal = logWrites.reduce((sum, w) => sum + (w.data as { amount: number }).amount, 0);
    expect(actualTotal).toBeCloseTo(expectedTotal, 1);
    // Every amount reflects the corrected 9.5% rate, not the original 7.25%.
    const atOldRate = valuationDelta(fd(), "2026-01-01", "2026-01-10");
    expect(actualTotal).toBeGreaterThan(atOldRate);
  });

  it("skips non-compound, non-FD, and inactive investments", () => {
    const simple = fd({ id: "s1", interestMethod: "simple" });
    const mutualFund = fd({ id: "m1", kind: "mutual_fund" });
    const closed = fd({ id: "c1", status: "closed" });
    const noRate = fd({ id: "n1", annualInterestRate: undefined });
    const { writes } = planFdInterestWrites(
      "u1",
      [
        { id: "s1", data: simple },
        { id: "m1", data: mutualFund },
        { id: "c1", data: closed },
        { id: "n1", data: noRate },
      ],
      "2026-01-10"
    );
    expect(writes).toEqual([]);
  });
});
