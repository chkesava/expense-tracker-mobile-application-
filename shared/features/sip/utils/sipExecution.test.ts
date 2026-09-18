import { describe, expect, it } from "vitest";

import {
  SIP_BATCH_WRITE_LIMIT,
  calculateNextExecutionDate,
  chunkSipOps,
  decideSipRun,
  isSipDue,
  isSipEnded,
  localDateKey,
  sipTransactionId,
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
