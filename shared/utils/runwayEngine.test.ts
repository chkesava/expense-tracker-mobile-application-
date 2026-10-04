import { describe, expect, it } from "vitest";

import type { CreditCardBill } from "../types/creditCardBill";
import type { Subscription } from "../types/subscription";
import { occurrencesBetween, runRunwayEngine, type RunwayEngineInput, type RunwayEvent } from "./runwayEngine";
import { creditCardBillsToRunwayEvents, subscriptionsToRunwayEvents } from "./runwayEvents";

const base = (over: Partial<RunwayEngineInput> = {}): RunwayEngineInput => ({
  today: "2026-10-01",
  mode: "commitment_projection",
  projectionMonths: 12,
  threshold: { kind: "none" },
  liquid: 100000,
  baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: { essential: 31000 } },
  events: [],
  ...over,
});

const out = (id: string, amount: number, schedule: RunwayEvent["schedule"], burnClass: RunwayEvent["burnClass"] = "essential"): RunwayEvent => ({
  id,
  label: id,
  source: "test",
  direction: "out",
  amount,
  burnClass,
  certainty: "expected",
  schedule,
});

describe("determinism", () => {
  it("gives identical output for identical input", () => {
    const input = base({ events: [out("rent", 15000, { kind: "monthly", firstDate: "2026-10-05", dayOfMonth: 5 })] });
    expect(runRunwayEngine(input)).toEqual(runRunwayEngine(structuredClone(input)));
  });

  it("does not mutate its input", () => {
    const input = base({ events: [out("x", 10, { kind: "once", date: "2026-10-10" })] });
    const before = JSON.stringify(input);
    runRunwayEngine(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("scalar modes", () => {
  it("net burn uses income and outflow; threshold date is today + months", () => {
    const r = runRunwayEngine(base({ mode: "net_burn", baseline: { monthlyEarnedIncome: 20000, monthlyOutflowByClass: { essential: 30000, discretionary: 10000 } } }));
    expect(r.result).toMatchObject({ state: "finite", months: 5, monthlyBurn: 20000 });
    // 5 × 30.4375 = 152 days.
    expect(r.thresholdDate).toBe("2027-03-02");
  });

  it("gross burn uses only essential classes and ignores income", () => {
    const r = runRunwayEngine(
      base({ mode: "gross_burn", baseline: { monthlyEarnedIncome: 99999, monthlyOutflowByClass: { essential: 20000, debt_service: 5000, discretionary: 50000, savings_contribution: 10000 } } })
    );
    expect(r.result).toMatchObject({ state: "finite", months: 4, monthlyBurn: 25000 });
    expect(r.essentialMonthly).toBe(25000);
  });

  it("handles zero, negative and positive burn", () => {
    const zero = runRunwayEngine(base({ mode: "net_burn", baseline: { monthlyEarnedIncome: 30000, monthlyOutflowByClass: { essential: 30000 } } }));
    expect(zero.result).toMatchObject({ state: "not_depleting", months: null });
    expect(zero.thresholdDate).toBeNull();
    const negative = runRunwayEngine(base({ mode: "net_burn", baseline: { monthlyEarnedIncome: 50000, monthlyOutflowByClass: { essential: 30000 } } }));
    expect(negative.result.state).toBe("not_depleting");
    const positive = runRunwayEngine(base({ mode: "net_burn", baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: { essential: 50000 } } }));
    expect(positive.result).toMatchObject({ state: "finite", months: 2 });
  });

  it("is insufficient without a baseline", () => {
    for (const mode of ["net_burn", "gross_burn", "commitment_projection"] as const) {
      const r = runRunwayEngine(base({ mode, baseline: null }));
      expect(r.result.state).toBe("insufficient_data");
      expect(r.thresholdDate).toBeNull();
    }
  });
});

describe("commitment-aware projection", () => {
  it("spreads the baseline across days and crosses zero on the right day", () => {
    // 31,000 a month in a 31-day October and 30-day November = 1,000 a day in October.
    const r = runRunwayEngine(base({ liquid: 40000 }));
    expect(r.periods[0]).toMatchObject({ month: "2026-10", opening: 40000, outflow: 31000, closing: 9000 });
    // November: 31,000 / 30 a day; 9,000 lasts 8.7 days, so day 9 goes negative.
    expect(r.thresholdDate).toBe("2026-11-09");
    expect(r.result).toMatchObject({ state: "finite", months: 1.3 });
  });

  it("measures down to the threshold, not zero", () => {
    const r = runRunwayEngine(base({ liquid: 40000, threshold: { kind: "amount", amount: 10000 } }));
    expect(r.thresholdDate).toBe("2026-10-31");
    expect(r.result.floor).toBe(10000);
  });

  it("supports an essential-months threshold", () => {
    const r = runRunwayEngine(base({ liquid: 100000, threshold: { kind: "essential_months", months: 1 } }));
    expect(r.result.floor).toBe(31000);
  });

  it("is already below when liquid is under the floor", () => {
    const r = runRunwayEngine(base({ liquid: 5000, threshold: { kind: "amount", amount: 10000 } }));
    expect(r.result).toMatchObject({ state: "already_below", months: 0 });
    expect(r.thresholdDate).toBe("2026-10-01");
  });

  it("applies a one-time event exactly once", () => {
    const r = runRunwayEngine(base({ baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: {} }, events: [out("fee", 5000, { kind: "once", date: "2026-12-15" })] }));
    expect(r.expectedOutflow).toBe(5000);
    expect(r.periods.find((p) => p.month === "2026-12")!.outflow).toBe(5000);
    expect(r.periods.filter((p) => p.outflow > 0)).toHaveLength(1);
    expect(r.result.state).toBe("beyond_horizon");
  });

  it("puts overdue one-time items on today and ignores items after the horizon", () => {
    expect(occurrencesBetween({ kind: "once", date: "2026-09-20" }, "2026-10-01", "2026-12-31")).toEqual(["2026-10-01"]);
    expect(occurrencesBetween({ kind: "once", date: "2027-02-01" }, "2026-10-01", "2026-12-31")).toEqual([]);
  });

  it("reports the minimum balance, monthly surplus/deficit and drivers", () => {
    const r = runRunwayEngine(
      base({
        liquid: 50000,
        projectionMonths: 3,
        baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: {} },
        events: [
          { ...out("salary", 60000, { kind: "monthly", firstDate: "2026-10-28", dayOfMonth: 28 }), direction: "in", burnClass: undefined },
          out("rent", 40000, { kind: "monthly", firstDate: "2026-10-05", dayOfMonth: 5 }),
        ],
      })
    );
    expect(r.periods.map((p) => p.net)).toEqual([20000, 20000, 20000]);
    expect(r.minimumBalance).toEqual({ amount: 10000, date: "2026-10-05" });
    expect(r.result.state).toBe("not_depleting");
    expect(r.drivers.map((d) => [d.id, d.amount, d.share])).toEqual([
      ["event:salary", 180000, 1],
      ["event:rent", 120000, 1],
    ]);
  });

  it("never counts money movement and leaves events out of gross mode by class", () => {
    const r = runRunwayEngine(
      base({
        baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: {} },
        events: [out("move", 9999, { kind: "once", date: "2026-10-02" }, "money_movement"), out("sip", 5000, { kind: "once", date: "2026-10-02" }, "savings_contribution")],
      })
    );
    expect(r.expectedOutflow).toBe(5000);
    const gross = runRunwayEngine(
      base({
        mode: "gross_burn",
        projectionMonths: 1,
        baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: {} },
        events: [
          out("emi", 2000, { kind: "once", date: "2026-10-02" }, "debt_service"),
          out("movie", 800, { kind: "once", date: "2026-10-02" }, "discretionary"),
          { ...out("salary", 50000, { kind: "once", date: "2026-10-02" }), direction: "in" },
        ],
      })
    );
    expect(gross.expectedOutflow).toBe(2000);
    expect(gross.expectedInflow).toBe(0);
  });

  it("flags bad input as insufficient data", () => {
    const r = runRunwayEngine(base({ projectionMonths: 0, events: [out("bad", -1, { kind: "once", date: "2026-13-01" })] }));
    expect(r.result.state).toBe("insufficient_data");
    expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe("cadence, month boundaries and leap years", () => {
  it("clamps day 31 to the end of short months, including 29 February in a leap year", () => {
    expect(occurrencesBetween({ kind: "monthly", firstDate: "2027-12-31", dayOfMonth: 31 }, "2027-12-01", "2028-04-30")).toEqual([
      "2027-12-31",
      "2028-01-31",
      "2028-02-29",
      "2028-03-31",
      "2028-04-30",
    ]);
    expect(occurrencesBetween({ kind: "monthly", firstDate: "2027-01-31", dayOfMonth: 31 }, "2027-01-01", "2027-03-31")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("stops monthly items after their end month", () => {
    expect(occurrencesBetween({ kind: "monthly", firstDate: "2026-10-03", dayOfMonth: 3, untilMonth: "2026-12" }, "2026-10-01", "2027-06-30")).toEqual([
      "2026-10-03",
      "2026-11-03",
      "2026-12-03",
    ]);
  });

  it("steps every-N-days across a leap day and catches up from a past start", () => {
    expect(occurrencesBetween({ kind: "every_n_days", firstDate: "2028-02-27", intervalDays: 2 }, "2028-02-27", "2028-03-04")).toEqual([
      "2028-02-27",
      "2028-02-29",
      "2028-03-02",
      "2028-03-04",
    ]);
    expect(occurrencesBetween({ kind: "every_n_days", firstDate: "2026-09-01", intervalDays: 7 }, "2026-10-01", "2026-10-15")).toEqual(["2026-10-06", "2026-10-13"]);
  });

  it("prorates a leap February by 29 days and partial first months by remaining days", () => {
    const r = runRunwayEngine(base({ today: "2028-02-15", projectionMonths: 2, liquid: 1_000_000, baseline: { monthlyEarnedIncome: 0, monthlyOutflowByClass: { essential: 29000 } } }));
    expect(r.periods[0]).toMatchObject({ month: "2028-02", startDate: "2028-02-15", endDate: "2028-02-29", outflow: 15000 });
    expect(r.periods[1]).toMatchObject({ month: "2028-03", outflow: 29000 });
    expect(r.horizonEnd).toBe("2028-03-31");
  });
});

describe("event adapters", () => {
  const sub = (over: Partial<Subscription>): Subscription => ({
    id: "s1",
    name: "Netflix",
    amount: 649,
    category: "Entertainment & Hobbies",
    dayOfMonth: 10,
    isActive: true,
    lastProcessed: "2026-09",
    type: "subscription",
    ...over,
  });

  it("turns active recurring items into scheduled outflows", () => {
    const events = subscriptionsToRunwayEvents(
      [
        sub({}),
        sub({ id: "emi", name: "Home loan", type: "emi", amount: 25000, dayOfMonth: 5, endYear: 2027, endMonth: 3 }),
        sub({ id: "paused", isActive: false }),
        sub({ id: "move", type: "transfer" }),
        sub({ id: "done", type: "emi", endYear: 2026, endMonth: 8 }),
      ],
      "2026-10-01"
    );
    expect(events.map((e) => e.id)).toEqual(["subscription:s1", "subscription:emi"]);
    expect(events[0]).toMatchObject({ burnClass: "discretionary", schedule: { kind: "monthly", firstDate: "2026-10-10" } });
    expect(events[1]).toMatchObject({ burnClass: "debt_service", schedule: { kind: "monthly", firstDate: "2026-10-05", untilMonth: "2027-03" } });
  });

  it("turns unpaid card bills into one-time outflows", () => {
    const bill = (over: Partial<CreditCardBill>) =>
      ({ id: "b1", accountId: "c", dueDate: "2026-10-20", remainingAmount: 12000, status: "UPCOMING", currency: "INR", ...over }) as CreditCardBill;
    const events = creditCardBillsToRunwayEvents([bill({}), bill({ id: "paid", status: "PAID", remainingAmount: 0 }), bill({ id: "usd", currency: "USD" })], "INR");
    expect(events).toEqual([expect.objectContaining({ id: "creditCardBill:b1", amount: 12000, schedule: { kind: "once", date: "2026-10-20" } })]);
  });
});

describe("performance", () => {
  it("projects 24 months with hundreds of events quickly", () => {
    const events = Array.from({ length: 300 }, (_, i) => out(`e${i}`, 100 + i, { kind: "monthly", firstDate: "2026-10-05", dayOfMonth: (i % 28) + 1 }));
    const t0 = performance.now();
    runRunwayEngine(base({ projectionMonths: 24, events }));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
