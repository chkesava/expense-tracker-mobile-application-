import { describe, expect, it } from "vitest";

import {
  ALREADY_EXISTS_CODE,
  classifyFirestoreError,
  cronFailureLog,
} from "@/shared/features/epf/utils/cronOutcome";

/**
 * SPENDLY-20. Every commit in `epf-cron.ts` was wrapped in a bare `catch {}`,
 * so a permission or quota error skipped an establishment silently, every
 * month, while the workflow reported success. These are the rules that decide
 * which failures red the run.
 */
describe("classifyFirestoreError", () => {
  const withCode = (code: unknown) => Object.assign(new Error("boom"), { code });

  it("treats a create collision as benign", () => {
    // `batch.create` throwing ALREADY_EXISTS is idempotency working.
    expect(classifyFirestoreError(withCode(ALREADY_EXISTS_CODE)).kind).toBe("benign");
    expect(classifyFirestoreError(withCode("already-exists")).kind).toBe("benign");
  });

  it("treats a rejected precondition as benign", () => {
    // The release pass refusing to demote a row the user just credited is the
    // fix working, not the cron failing.
    expect(classifyFirestoreError(withCode(9)).kind).toBe("benign");
    expect(classifyFirestoreError(withCode("failed-precondition")).kind).toBe("benign");
  });

  it("treats a deleted row as benign", () => {
    expect(classifyFirestoreError(withCode(5)).kind).toBe("benign");
    expect(classifyFirestoreError(withCode("not-found")).kind).toBe("benign");
  });

  it.each([
    ["PERMISSION_DENIED", 7],
    ["INVALID_ARGUMENT (the over-sized batch)", 3],
    ["RESOURCE_EXHAUSTED", 8],
    ["ABORTED", 10],
    ["UNAVAILABLE", 14],
  ])("treats %s as fatal", (_name, code) => {
    expect(classifyFirestoreError(withCode(code)).kind).toBe("fatal");
  });

  it("defaults an unrecognised code to fatal", () => {
    // The rule that stops a new failure mode reopening this ticket in silence.
    expect(classifyFirestoreError(withCode(4242)).kind).toBe("fatal");
    expect(classifyFirestoreError(withCode("some-new-code")).kind).toBe("fatal");
  });

  it("handles errors with no code at all", () => {
    expect(classifyFirestoreError(new Error("boom"))).toEqual({
      kind: "fatal",
      code: null,
      message: "boom",
    });
    expect(classifyFirestoreError("boom").kind).toBe("fatal");
    expect(classifyFirestoreError(undefined).code).toBeNull();
    expect(classifyFirestoreError(null).kind).toBe("fatal");
  });

  it("ignores a non-scalar code", () => {
    expect(classifyFirestoreError(withCode({ nested: true })).code).toBeNull();
  });
});

describe("cronFailureLog", () => {
  it("carries enough to find the establishment that keeps failing", () => {
    const error = Object.assign(new Error("Missing or insufficient permissions"), {
      code: 7,
    });
    expect(
      cronFailureLog({
        stage: "generation",
        uid: "uid-1",
        establishmentId: "est-1",
        month: "2026-09",
        rows: 3,
        error,
      })
    ).toEqual({
      event: "epf-cron.failure",
      stage: "generation",
      uid: "uid-1",
      establishmentId: "est-1",
      month: "2026-09",
      rows: 3,
      kind: "fatal",
      code: 7,
      message: "Missing or insufficient permissions",
    });
  });

  it("never carries a stack", () => {
    const log = cronFailureLog({
      stage: "lifecycle-release",
      uid: "uid-1",
      establishmentId: "est-1",
      month: null,
      rows: 1,
      error: new Error("boom"),
    });
    expect(Object.keys(log)).not.toContain("stack");
    expect(JSON.stringify(log)).not.toContain("cronOutcome.test");
  });
});
