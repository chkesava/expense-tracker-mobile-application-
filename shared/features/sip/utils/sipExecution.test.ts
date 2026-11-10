import { describe, expect, it } from "vitest";

import {
  SIP_BATCH_WRITE_LIMIT,
  calculateNextExecutionDate,
  chunkSipOps,
  decideSipRun,
  isSipDue,
  isSipEnded,
  localDateKey,
  sipScheduledKey,
  sipTransactionId,
  startOfLocalDay,
  writesForSipOp,
} from "./sipExecution";
import type { SipPlanForRun } from "./sipExecution";

const TODAY = new Date(2026, 8, 18);

function plan(partial: Partial<SipPlanForRun> = {}): SipPlanForRun {
  return {
    id: "sip1",
    status: "active",
    nextExecutionDate: new Date(2026, 8, 18).toISOString(),
    skipNextExecution: false,
    frequency: "monthly",
    executionDay: 18,
    investmentAmount: 5000,
    currency: "INR",
    symbol: "INFY.NS",
    quoteKey: "INFY.NS",
    assetName: "Infosys",
    assetType: "stock",
    totalInvested: 10000,
    totalUnits: 5,
    ...partial,
  };
}

describe("sipTransactionId", () => {
  it("is deterministic for a plan and scheduled day", () => {
    expect(sipTransactionId("sip1", "2026-09-18")).toBe("sip1_2026-09-18");
  });
});

describe("isSipDue / isSipEnded", () => {
  it("is due when nextExecutionDate is today or earlier", () => {
    expect(isSipDue(new Date(2026, 8, 18).toISOString(), TODAY)).toBe(true);
    expect(isSipDue(new Date(2026, 8, 19).toISOString(), TODAY)).toBe(false);
  });

  it("completes when the scheduled day is after endDate", () => {
    expect(isSipEnded("2026-09-17", "2026-09-18")).toBe(true);
    expect(isSipEnded("2026-09-18", "2026-09-18")).toBe(false);
    expect(isSipEnded(undefined, "2026-09-18")).toBe(false);
  });
});

describe("decideSipRun", () => {
  it("executes at the live price and never falls back to 100", () => {
    const op = decideSipRun(plan(), { today: TODAY, price: 250 });
    expect(op?.kind).toBe("execute");
    if (op?.kind !== "execute") return;
    expect(op.txId).toBe("sip1_2026-09-18");
    expect(op.price).toBe(250);
    expect(op.units).toBe(20);
    expect(op.amount).toBe(5000);
  });

  it("records a failed row when the quote is missing instead of fabricating a price", () => {
    const op = decideSipRun(plan(), { today: TODAY });
    expect(op?.kind).toBe("fail");
    if (op?.kind !== "fail") return;
    expect(op.txId).toBe("sip1_2026-09-18");
    expect(op.reason).toBe("Quote unavailable");
  });

  it("skips a second tap once that day's transaction already executed", () => {
    expect(
      decideSipRun(plan(), { today: TODAY, price: 250, existingTxStatus: "executed" })
    ).toBeNull();
  });

  it("retries after a failed quote for the same scheduled day", () => {
    const op = decideSipRun(plan(), {
      today: TODAY,
      price: 250,
      existingTxStatus: "failed",
    });
    expect(op?.kind).toBe("execute");
  });

  it("marks the plan completed once endDate has passed", () => {
    const op = decideSipRun(plan({ endDate: "2026-09-17" }), { today: TODAY, price: 250 });
    expect(op).toEqual({ kind: "complete", planId: "sip1" });
  });

  it("advances a skipped due date without buying", () => {
    const op = decideSipRun(plan({ skipNextExecution: true }), { today: TODAY, price: 250 });
    expect(op?.kind).toBe("skip");
  });
});

describe("chunkSipOps", () => {
  it("stays under the Firestore batch cap", () => {
    const ops = Array.from({ length: 200 }, (_, index) =>
      decideSipRun(plan({ id: `sip${index}` }), { today: TODAY, price: 100 })
    ).filter((op): op is NonNullable<typeof op> => op != null);

    expect(writesForSipOp(ops[0]!)).toBe(4);
    const chunks = chunkSipOps(ops);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const writes = chunk.reduce((sum, op) => sum + writesForSipOp(op), 0);
      expect(writes).toBeLessThanOrEqual(SIP_BATCH_WRITE_LIMIT);
    }
  });
});

describe("calculateNextExecutionDate", () => {
  it("moves a monthly plan to the next execution day", () => {
    const next = calculateNextExecutionDate("monthly", 10, new Date(2026, 8, 18));
    expect(localDateKey(next)).toBe("2026-10-10");
  });
});

describe("timezone-aware keys for server jobs (SPENDLY-725)", () => {
  const IST = "Asia/Kolkata";
  // A plan created on an IST phone for 11 Nov 2026 stores IST midnight.
  const istMidnight = "2026-11-10T18:30:00.000Z";

  it("without a zone, behaves exactly as before (device local)", () => {
    const from = new Date(2026, 0, 31);
    for (const f of ["daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
      const expected = calculateNextExecutionDate(f, 31, from).toISOString();
      expect(calculateNextExecutionDate(f, 31, from, undefined).toISOString()).toBe(expected);
    }
    expect(localDateKey(TODAY, undefined)).toBe(localDateKey(TODAY));
    expect(decideSipRun(plan(), { today: TODAY, price: 50 })).toEqual(
      decideSipRun(plan(), { today: TODAY, price: 50, timeZone: undefined })
    );
  });

  it("the scheduled key and due check use the user zone, not the runner zone", () => {
    expect(sipScheduledKey(istMidnight, IST)).toBe("2026-11-11");
    expect(sipScheduledKey(istMidnight, "UTC")).toBe("2026-11-10");
    // 03:30 IST on 11 Nov = 22:00 UTC on 10 Nov: due in IST.
    expect(isSipDue(istMidnight, new Date("2026-11-10T22:00:00.000Z"), IST)).toBe(true);
    // 23:00 IST on 10 Nov: not due yet in IST.
    expect(isSipDue(istMidnight, new Date("2026-11-10T17:30:00.000Z"), IST)).toBe(false);
  });

  it("startOfLocalDay in a zone is midnight in that zone", () => {
    expect(startOfLocalDay(new Date("2026-11-10T22:00:00.000Z"), IST).toISOString()).toBe(istMidnight);
  });

  it("the next execution date is midnight of the next calendar day in the zone (monthly, short months)", () => {
    const next = calculateNextExecutionDate("monthly", 11, new Date(istMidnight), IST);
    expect(next.toISOString()).toBe("2026-12-10T18:30:00.000Z");
    // Same calendar rule as the phone for every frequency, from a month end.
    // (Month-end handling itself is pinned in the SPENDLY-731 tests below.)
    const fromKey = "2027-01-31";
    const phone = (f: "daily" | "weekly" | "monthly" | "quarterly" | "yearly") =>
      localDateKey(calculateNextExecutionDate(f, 31, new Date(2027, 0, 31)));
    for (const f of ["daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
      const server = calculateNextExecutionDate(f, 31, new Date(`${fromKey}T00:00:00.000Z`), IST);
      expect(localDateKey(server, IST)).toBe(phone(f));
    }
  });

  it("decideSipRun on a UTC runner produces the ids an IST phone would (idempotent with the app)", () => {
    const op = decideSipRun(
      plan({ nextExecutionDate: istMidnight, executionDay: 11 }),
      { today: new Date("2026-11-10T22:00:00.000Z"), price: 50, timeZone: IST }
    );
    expect(op?.kind).toBe("execute");
    if (op?.kind !== "execute") return;
    expect(op.txId).toBe(sipTransactionId("sip1", "2026-11-11"));
    expect(op.scheduledKey).toBe("2026-11-11");
    expect(op.nextExecutionDate).toBe("2026-12-10T18:30:00.000Z");
  });
});

describe("month-end execution days (SPENDLY-731)", () => {
  const next = (f: "monthly" | "quarterly" | "yearly", day: number, y: number, m: number, d: number) =>
    localDateKey(calculateNextExecutionDate(f, day, new Date(y, m - 1, d)));

  it("monthly day 31 visits every month, clamped to its length (no skipped February)", () => {
    expect(next("monthly", 31, 2027, 1, 31)).toBe("2027-02-28");
    expect(next("monthly", 31, 2027, 2, 28)).toBe("2027-03-31");
    expect(next("monthly", 31, 2027, 3, 31)).toBe("2027-04-30");
    expect(next("monthly", 31, 2027, 4, 30)).toBe("2027-05-31");
    expect(next("monthly", 31, 2028, 1, 31)).toBe("2028-02-29"); // leap year
    expect(next("monthly", 31, 2026, 12, 31)).toBe("2027-01-31"); // year rolls over
  });

  it("a day-31 plan scheduled on 28 Feb moves on to March (was stuck: 28 Feb gave 28 Feb)", () => {
    const from = new Date(2027, 1, 28);
    const result = calculateNextExecutionDate("monthly", 31, from);
    expect(result.getTime()).toBeGreaterThan(from.getTime());
    expect(localDateKey(result)).toBe("2027-03-31");
  });

  it("monthly day 29 and 30 clamp in February and come back after", () => {
    expect(next("monthly", 30, 2027, 1, 30)).toBe("2027-02-28");
    expect(next("monthly", 30, 2027, 2, 28)).toBe("2027-03-30");
    expect(next("monthly", 29, 2027, 1, 29)).toBe("2027-02-28");
    expect(next("monthly", 29, 2028, 1, 29)).toBe("2028-02-29");
  });

  it("ordinary days behave exactly as before", () => {
    expect(next("monthly", 15, 2026, 11, 15)).toBe("2026-12-15"); // on the day: next month
    expect(next("monthly", 15, 2026, 11, 10)).toBe("2026-11-15"); // before the day: this month
    expect(next("monthly", 15, 2026, 11, 20)).toBe("2026-12-15"); // after the day: next month
    expect(next("monthly", 1, 2026, 12, 1)).toBe("2027-01-01");
  });

  it("the result is always strictly after the start, for every monthly day and start in a year", () => {
    for (let day = 1; day <= 31; day++) {
      for (let t = new Date(2027, 0, 1); t.getFullYear() === 2027; t.setDate(t.getDate() + 1)) {
        const from = new Date(t);
        const result = calculateNextExecutionDate("monthly", day, from);
        expect(result.getTime()).toBeGreaterThan(from.getTime());
        // and never more than one month ahead (no skipped month)
        const monthsAhead = (result.getFullYear() - from.getFullYear()) * 12 + result.getMonth() - from.getMonth();
        expect(monthsAhead).toBeLessThanOrEqual(1);
      }
    }
  });

  it("quarterly and yearly clamp at month end instead of overflowing", () => {
    expect(next("quarterly", 31, 2026, 11, 30)).toBe("2027-02-28");
    expect(next("quarterly", 31, 2026, 8, 31)).toBe("2026-11-30");
    expect(next("quarterly", 31, 2027, 2, 28)).toBe("2027-05-31");
    expect(next("yearly", 29, 2028, 2, 29)).toBe("2029-02-28");
    expect(next("yearly", 15, 2026, 6, 15)).toBe("2027-06-15");
  });

  it("the server (user's zone) and the phone still agree on month ends", () => {
    const IST = "Asia/Kolkata";
    const server = calculateNextExecutionDate("monthly", 31, new Date("2027-01-30T18:30:00.000Z"), IST); // 31 Jan IST
    expect(localDateKey(server, IST)).toBe("2027-02-28");
  });
});
