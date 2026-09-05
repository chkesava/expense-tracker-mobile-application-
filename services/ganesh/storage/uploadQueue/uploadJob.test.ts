import { describe, expect, it } from "vitest";

import {
  applyFailedAttempt,
  COMPLETED_RETENTION_MS,
  createUploadJob,
  dueUploadJobs,
  isPermanentUploadFailure,
  markUploading,
  MAX_ATTEMPTS,
  MAX_JOB_AGE_MS,
  nextWakeAt,
  reconcileLoadedJobs,
  retryDelayMs,
  RETRY_MAX_MS,
  uploadJobId,
  type GaneshUploadJob,
  type GaneshUploadTarget,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";

const EXPENSE: GaneshUploadTarget = {
  kind: "expenseReceipt",
  pandalId: "pandal-1",
  festivalId: "fest-1",
  recordId: "exp-1",
};

function job(overrides: Partial<GaneshUploadJob> = {}): GaneshUploadJob {
  return {
    ...createUploadJob({
      target: EXPENSE,
      file: { uri: "file:///q/exp-1.jpg", fileName: "receipt.jpg", mimeType: "image/jpeg", size: 100 },
      actor: { uid: "uid-1", displayName: "Ravi" },
      auth: { festivalBelongsToPandal: true },
      now: 1_000,
    }),
    ...overrides,
  };
}

describe("uploadJobId", () => {
  it("is deterministic for the same slot", () => {
    expect(uploadJobId(EXPENSE)).toBe(uploadJobId({ ...EXPENSE }));
  });

  it("separates records, categories, festivals and pandals", () => {
    const ids = new Set([
      uploadJobId(EXPENSE),
      uploadJobId({ ...EXPENSE, recordId: "exp-2" }),
      uploadJobId({ ...EXPENSE, festivalId: "fest-2" }),
      uploadJobId({ ...EXPENSE, pandalId: "pandal-2" }),
      uploadJobId({ ...EXPENSE, kind: "contributionPhoto" }),
      uploadJobId({ kind: "assetPhoto", pandalId: "pandal-1", recordId: "exp-1" }),
    ]);
    expect(ids.size).toBe(6);
  });
});

describe("retry policy", () => {
  it("backs off exponentially and then caps", () => {
    const fixed = () => 0.5; // no jitter
    expect(retryDelayMs(1, fixed)).toBe(5_000);
    expect(retryDelayMs(2, fixed)).toBe(15_000);
    expect(retryDelayMs(3, fixed)).toBe(45_000);
    expect(retryDelayMs(9, fixed)).toBe(RETRY_MAX_MS);
  });

  it("keeps jitter inside the declared spread", () => {
    expect(retryDelayMs(2, () => 0)).toBe(12_000);
    expect(retryDelayMs(2, () => 1)).toBe(18_000);
  });

  it("treats permission, auth and size failures as permanent", () => {
    expect(isPermanentUploadFailure(new Error("You do not have permission to store this file."))).toBe(true);
    expect(isPermanentUploadFailure(new Error("This image is too large."))).toBe(true);
    expect(isPermanentUploadFailure(new Error("Sign in again to use files."))).toBe(true);
    expect(isPermanentUploadFailure({ code: "permission-denied" })).toBe(true);
  });

  it("treats connectivity and unknown failures as transient", () => {
    expect(isPermanentUploadFailure(new Error("No internet connection."))).toBe(false);
    expect(isPermanentUploadFailure(new Error("Upload timed out. Please try again."))).toBe(false);
    expect(isPermanentUploadFailure(new Error("Storage is unavailable right now."))).toBe(false);
    expect(isPermanentUploadFailure(new Error("something nobody has seen before"))).toBe(false);
  });
});

describe("applyFailedAttempt", () => {
  it("schedules a retry for a transient failure", () => {
    const next = applyFailedAttempt(markUploading(job(), 2_000), {
      error: new Error("No internet connection."),
      message: "No internet connection.",
      now: 2_000,
      random: () => 0.5,
    });
    expect(next.state).toBe("RETRYING");
    expect(next.nextAttemptAt).toBe(7_000);
    expect(next.lastError).toBe("No internet connection.");
  });

  it("fails immediately on a permanent failure, however early", () => {
    const next = applyFailedAttempt(markUploading(job(), 2_000), {
      error: new Error("You do not have permission to store this file."),
      message: "You do not have permission to store this file.",
      now: 2_000,
    });
    expect(next.state).toBe("FAILED");
    expect(next.failureReason).toBe("permanent");
  });

  it("gives up once the attempts are spent", () => {
    const spent = { ...job(), attempts: MAX_ATTEMPTS, state: "UPLOADING" as const };
    const next = applyFailedAttempt(spent, {
      error: new Error("No internet connection."),
      message: "No internet connection.",
      now: 2_000,
    });
    expect(next.state).toBe("FAILED");
    expect(next.failureReason).toBe("exhausted");
  });
});

describe("scheduling", () => {
  it("runs PENDING jobs and RETRYING jobs whose time has come", () => {
    const pending = job({ id: "a" });
    const soon = job({ id: "b", state: "RETRYING", nextAttemptAt: 5_000 });
    const later = job({ id: "c", state: "RETRYING", nextAttemptAt: 50_000 });
    const done = job({ id: "d", state: "UPLOADED" });
    expect(dueUploadJobs([pending, soon, later, done], 10_000).map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("reports the earliest waiting retry", () => {
    expect(
      nextWakeAt([
        job({ id: "b", state: "RETRYING", nextAttemptAt: 50_000 }),
        job({ id: "c", state: "RETRYING", nextAttemptAt: 20_000 }),
      ])
    ).toBe(20_000);
    expect(nextWakeAt([job()])).toBeUndefined();
  });
});

describe("reconcileLoadedJobs", () => {
  it("revives a job stranded mid-upload by a killed process", () => {
    const stranded = job({ state: "UPLOADING", attempts: 2 });
    const [revived] = reconcileLoadedJobs([stranded], 10_000);
    expect(revived.state).toBe("PENDING");
    // The spent attempt is kept, so a job that keeps crashing the app still
    // reaches its ceiling instead of retrying forever.
    expect(revived.attempts).toBe(2);
  });

  it("fails a job that has waited beyond the age limit", () => {
    const ancient = job({ createdAt: 0 });
    const [failed] = reconcileLoadedJobs([ancient], MAX_JOB_AGE_MS + 1);
    expect(failed.state).toBe("FAILED");
    expect(failed.failureReason).toBe("expired");
  });

  it("keeps a finished job only for its retention window", () => {
    const fresh = job({ state: "UPLOADED", updatedAt: 10_000 });
    const stale = job({ id: "old", state: "UPLOADED", updatedAt: 0 });
    const kept = reconcileLoadedJobs([fresh, stale], 10_000 + COMPLETED_RETENTION_MS - 1);
    expect(kept.map((entry) => entry.id)).toEqual([fresh.id]);
  });

  it("drops cancelled jobs outright", () => {
    expect(reconcileLoadedJobs([job({ state: "CANCELLED" })], 10_000)).toEqual([]);
  });
});
