import { describe, expect, it } from "vitest";

import { classifyGoalWriteFailure, errorCode, goalFailureMessage } from "./goalWriteFailure";

const expectPlan = { version: { kind: "expect" as const, next: 4 }, amountDelta: 0 };
const amountPlan = (amountDelta: number) => ({ version: { kind: "increment" as const }, amountDelta });
const settingsPlan = { version: { kind: "none" as const }, amountDelta: 0 };

describe("goal write failures (conflict policy)", () => {
  it("a refused versioned edit is a conflict with another device", () => {
    expect(classifyGoalWriteFailure("permission-denied", expectPlan)).toBe("conflict");
    expect(goalFailureMessage("conflict", expectPlan)).toMatch(/changed on another device.*Retry applies it to the latest/);
  });

  it("a refused amount change explains the merge-safe reasons", () => {
    expect(classifyGoalWriteFailure("permission-denied", amountPlan(-500))).toBe("refused");
    expect(goalFailureMessage("refused", amountPlan(-500))).toMatch(/below zero/);
    expect(goalFailureMessage("refused", amountPlan(100))).toMatch(/completed, archived or cancelled/);
    expect(classifyGoalWriteFailure("already-exists", settingsPlan)).toBe("refused");
  });

  it("network trouble is retryable, unknown errors stay generic", () => {
    expect(classifyGoalWriteFailure("unavailable", amountPlan(1))).toBe("unavailable");
    expect(classifyGoalWriteFailure("internal", amountPlan(1))).toBe("other");
    expect(classifyGoalWriteFailure(undefined, amountPlan(1))).toBe("other");
  });

  it("reads codes from Firebase errors, with or without the prefix", () => {
    expect(errorCode({ code: "permission-denied" })).toBe("permission-denied");
    expect(errorCode({ code: "firestore/unavailable" })).toBe("unavailable");
    expect(errorCode(new Error("x"))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});
