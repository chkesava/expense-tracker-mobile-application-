import { describe, expect, it } from "vitest";

import {
  MAX_TOKENS_PER_REGISTRATION,
  allocateTokenNumbers,
  eligibleTokens,
  formatTokenCode,
  pickWinner,
  readDrawReadiness,
  readTokenCapacity,
  splitAmountAcrossTokens,
  validateTokenCapacityChange,
  validateTokenRegistration,
} from "./ganeshTokenLaddu";
import type { TokenLadduToken } from "@/shared/types/ganeshTokenLaddu";

const CONFIG = {
  totalTokens: 500,
  amountPerToken: 100,
  nextTokenNumber: 0,
  registeredCount: 0,
  cancelledCount: 0,
};

const VALID = {
  quantity: 5,
  amount: 500,
  participantName: "Anjali",
  receiptNumberPhysical: "A-101",
  config: CONFIG,
};

describe("formatTokenCode", () => {
  it("is year-prefixed, padded, and readable out loud", () => {
    expect(formatTokenCode(2026, 1)).toBe("TKN26-000001");
    expect(formatTokenCode(2026, 42)).toBe("TKN26-000042");
    expect(formatTokenCode(2030, 123456)).toBe("TKN30-123456");
  });

  it("sorts lexicographically in numeric order, which the PDF relies on", () => {
    const codes = [5, 1, 40, 2].map((n) => formatTokenCode(2026, n));
    expect([...codes].sort()).toEqual([
      "TKN26-000001",
      "TKN26-000002",
      "TKN26-000005",
      "TKN26-000040",
    ]);
  });
});

describe("allocateTokenNumbers", () => {
  it("hands out a contiguous run starting after the allocator", () => {
    expect(allocateTokenNumbers(0, 3)).toEqual([1, 2, 3]);
    expect(allocateTokenNumbers(41, 2)).toEqual([42, 43]);
  });

  it("produces exactly `quantity` numbers, all distinct", () => {
    const numbers = allocateTokenNumbers(7, 5);
    expect(numbers).toHaveLength(5);
    expect(new Set(numbers).size).toBe(5);
  });
});

describe("splitAmountAcrossTokens", () => {
  it("divides evenly when it can", () => {
    expect(splitAmountAcrossTokens(500, 5)).toEqual([100, 100, 100, 100, 100]);
  });

  it("keeps the remainder rather than losing it", () => {
    // 100/3 is 33.33 three times, which is 99.99. The stray paise has to go
    // somewhere or the PDF's column total stops matching the money collected.
    const shares = splitAmountAcrossTokens(100, 3);
    expect(shares).toHaveLength(3);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 2);
  });

  it("handles a zero-value registration", () => {
    expect(splitAmountAcrossTokens(0, 2)).toEqual([0, 0]);
    expect(splitAmountAcrossTokens(100, 0)).toEqual([]);
  });
});

describe("readTokenCapacity", () => {
  it("reports remaining and eligible separately", () => {
    const capacity = readTokenCapacity({
      totalTokens: 100,
      registeredCount: 40,
      cancelledCount: 5,
    });
    expect(capacity.remaining).toBe(60);
    // Cancelled tokens still occupy their number, so they reduce the pot
    // without freeing capacity.
    expect(capacity.eligible).toBe(35);
    expect(capacity.full).toBe(false);
  });

  it("never reports negative room", () => {
    const capacity = readTokenCapacity({ totalTokens: 10, registeredCount: 12 });
    expect(capacity.remaining).toBe(0);
    expect(capacity.full).toBe(true);
  });

  it("treats a missing config as nothing configured", () => {
    expect(readTokenCapacity(null).total).toBe(0);
    expect(readTokenCapacity(undefined).remaining).toBe(0);
  });
});

describe("validateTokenRegistration", () => {
  it("accepts a well-formed registration", () => {
    expect(() => validateTokenRegistration(VALID)).not.toThrow();
  });

  it("requires a name and a physical receipt number", () => {
    expect(() => validateTokenRegistration({ ...VALID, participantName: "  " })).toThrow(/name/i);
    expect(() =>
      validateTokenRegistration({ ...VALID, receiptNumberPhysical: "" })
    ).toThrow(/receipt number/i);
  });

  it("requires a whole, positive quantity", () => {
    for (const quantity of [0, -1, 2.5]) {
      expect(() => validateTokenRegistration({ ...VALID, quantity })).toThrow(/whole number/i);
    }
  });

  it("caps a single receipt, which also keeps the transaction inside its write limit", () => {
    expect(() =>
      validateTokenRegistration({ ...VALID, quantity: MAX_TOKENS_PER_REGISTRATION + 1 })
    ).toThrow(/up to 50/);
  });

  it("refuses before anything is configured", () => {
    expect(() => validateTokenRegistration({ ...VALID, config: null })).toThrow(
      /Set the number of Token Laddus/
    );
  });

  it("blocks registering past capacity, and says how many are left", () => {
    expect(() =>
      validateTokenRegistration({
        ...VALID,
        quantity: 5,
        config: { ...CONFIG, totalTokens: 10, registeredCount: 8 },
      })
    ).toThrow(/Only 2 Token Laddus are left/);
  });

  it("says the pot is full rather than offering zero", () => {
    expect(() =>
      validateTokenRegistration({
        ...VALID,
        quantity: 1,
        config: { ...CONFIG, totalTokens: 10, registeredCount: 10 },
      })
    ).toThrow(/All 10 Token Laddus are registered/);
  });

  it("gets the singular right, because this copy is read under pressure", () => {
    expect(() =>
      validateTokenRegistration({
        ...VALID,
        quantity: 2,
        config: { ...CONFIG, totalTokens: 10, registeredCount: 9 },
      })
    ).toThrow(/Only 1 Token Laddu is left/);
  });
});

describe("validateTokenCapacityChange", () => {
  it("accepts a raise with no reason", () => {
    expect(() =>
      validateTokenCapacityChange({ totalTokens: 600, config: CONFIG })
    ).not.toThrow();
  });

  it("refuses to drop below what is already registered", () => {
    expect(() =>
      validateTokenCapacityChange({
        totalTokens: 50,
        config: { ...CONFIG, registeredCount: 120 },
        reason: "miscounted",
      })
    ).toThrow(/120 Token Laddus are already registered/);
  });

  it("requires a reason to reduce", () => {
    expect(() =>
      validateTokenCapacityChange({ totalTokens: 100, config: { ...CONFIG, totalTokens: 500 } })
    ).toThrow(/reason/i);
  });

  it("refuses a fractional or negative count", () => {
    expect(() => validateTokenCapacityChange({ totalTokens: -1, config: CONFIG })).toThrow();
    expect(() => validateTokenCapacityChange({ totalTokens: 1.5, config: CONFIG })).toThrow();
  });
});

describe("readDrawReadiness", () => {
  it("allows a draw while tokens and draws remain", () => {
    const state = readDrawReadiness({ plannedDraws: 10, completedDraws: 2, eligibleCount: 50 });
    expect(state.canDraw).toBe(true);
    expect(state.remainingDraws).toBe(8);
    expect(state.shortfall).toBe(false);
  });

  it("stops once every configured draw is done", () => {
    const state = readDrawReadiness({ plannedDraws: 10, completedDraws: 10, eligibleCount: 5 });
    expect(state.canDraw).toBe(false);
    expect(state.blockedReason).toMatch(/Every draw is done/);
  });

  it("flags a shortfall rather than letting the draw invent winners", () => {
    // Eight draws left, three tokens in the pot: the extra five have no
    // legitimate winner and must not be filled by drawing anyone twice.
    const state = readDrawReadiness({ plannedDraws: 10, completedDraws: 2, eligibleCount: 3 });
    expect(state.shortfall).toBe(true);
    // Still drawable — the three real winners should be drawn, then it stops.
    expect(state.canDraw).toBe(true);
  });

  it("stops when the pot is empty", () => {
    const state = readDrawReadiness({ plannedDraws: 10, completedDraws: 2, eligibleCount: 0 });
    expect(state.canDraw).toBe(false);
    expect(state.blockedReason).toMatch(/No Token Laddus are left/);
  });

  it("stops on a finished session", () => {
    const state = readDrawReadiness({
      plannedDraws: 10,
      completedDraws: 1,
      eligibleCount: 9,
      sessionStatus: "completed",
    });
    expect(state.canDraw).toBe(false);
    expect(state.blockedReason).toMatch(/finished/);
  });
});

describe("eligibleTokens and pickWinner", () => {
  const tokens = [
    { id: "TKN26-000003", tokenNumber: 3, status: "eligible" },
    { id: "TKN26-000001", tokenNumber: 1, status: "winner" },
    { id: "TKN26-000002", tokenNumber: 2, status: "eligible" },
    { id: "TKN26-000004", tokenNumber: 4, status: "cancelled" },
  ] as TokenLadduToken[];

  it("keeps only tokens still in the pot, in a stable order", () => {
    expect(eligibleTokens(tokens).map((token) => token.id)).toEqual([
      "TKN26-000002",
      "TKN26-000003",
    ]);
  });

  it("picks from the pool using the supplied source", () => {
    const pool = eligibleTokens(tokens);
    expect(pickWinner(pool, () => 0)?.id).toBe("TKN26-000002");
    expect(pickWinner(pool, () => 1)?.id).toBe("TKN26-000003");
  });

  it("returns null on an empty pot instead of inventing a winner", () => {
    expect(pickWinner([], () => 0)).toBeNull();
  });

  it("refuses an out-of-range index rather than silently picking wrong", () => {
    expect(() => pickWinner([1, 2, 3], () => 7)).toThrow(/invalid index/);
    expect(() => pickWinner([1, 2, 3], () => 1.5)).toThrow(/invalid index/);
  });

  it("can reach every token in the pool", () => {
    const pool = [1, 2, 3, 4, 5];
    const seen = new Set(pool.map((_, index) => pickWinner(pool, () => index)));
    expect(seen.size).toBe(5);
  });
});
