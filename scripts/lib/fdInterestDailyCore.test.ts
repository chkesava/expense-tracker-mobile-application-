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

  it("credits a day's growth, matching computeInterestValuation's own delta", () => {
    const investment = fd();
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: investment }],
      "2026-01-10"
    );
    expect(credited).toBe(1);
    const today = computeInterestValuation(
      investment.principal,
      investment.annualInterestRate!,
      "compound",
      "daily",
      investment.startDate,
      "2026-01-10"
    );
    const yesterday = computeInterestValuation(
      investment.principal,
      investment.annualInterestRate!,
      "compound",
      "daily",
      investment.startDate,
      "2026-01-09"
    );
    const expectedAmount = Math.round((today.totalValue - yesterday.totalValue) * 100) / 100;

    const logWrite = writes.find((w) => w.path === "users/u1/investments/fd1/interestCredits/2026-01-10");
    expect(logWrite).toBeDefined();
    expect(logWrite).toMatchObject({
      kind: "set",
      data: { date: "2026-01-10", amount: expectedAmount },
    });
    const accountWrite = writes.find((w) => w.path === "users/u1/investments/fd1");
    expect(accountWrite).toMatchObject({ kind: "update", data: { lastInterestCreditedDate: "2026-01-10" } });
  });

  it("still credits correctly after a multi-day gap since the last run", () => {
    // Job didn't run for 3 days; today vs yesterday is still a correct, pure
    // function of elapsed days from startDate, so a stale rerun self-heals.
    const investment = fd();
    const { writes } = planFdInterestWrites("u1", [{ id: "fd1", data: investment }], "2026-01-20");
    const logWrite = writes.find((w) => w.path === "users/u1/investments/fd1/interestCredits/2026-01-20");
    expect(logWrite).toBeDefined();
    expect((logWrite as { data: { amount: number } }).data.amount).toBeGreaterThan(0);
  });

  it("stops crediting a matured FD past its maturity date", () => {
    const investment = fd({ maturityDate: "2026-01-15" });
    const { writes, credited } = planFdInterestWrites(
      "u1",
      [{ id: "fd1", data: investment }],
      "2026-02-01"
    );
    expect(writes).toEqual([]);
    expect(credited).toBe(0);
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
