import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUploadJob,
  markUploading,
  MAX_ATTEMPTS,
  type GaneshUploadJob,
  type GaneshUploadTarget,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
import {
  loadUploadJobs,
  putUploadJob,
  resetUploadQueueStoreForTests,
} from "@/services/ganesh/storage/uploadQueue/uploadJobStore";
import {
  processUploadJob,
  resetUploadWorkerForTests,
  runUploadQueue,
  type UploadWorkerDeps,
} from "@/services/ganesh/storage/uploadQueue/uploadWorker";
import type { GaneshFileMeta } from "@/shared/types/ganesh";

const disk = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.set(key, value);
    },
  },
}));

const EXPENSE: GaneshUploadTarget = {
  kind: "expenseReceipt",
  pandalId: "pandal-1",
  festivalId: "fest-1",
  recordId: "exp-1",
};

const META: GaneshFileMeta = {
  path: "pandals/pandal-1/festivals/fest-1/expenses/exp-1/receipt.jpg",
  fileName: "receipt.jpg",
  mimeType: "image/jpeg",
  size: 100,
  uploadedAt: "2026-09-05T00:00:00.000Z",
  uploadedBy: "uid-1",
};

function job(overrides: Partial<GaneshUploadJob> = {}): GaneshUploadJob {
  return {
    ...createUploadJob({
      target: EXPENSE,
      file: { uri: "file:///q/exp-1.jpg", fileName: "receipt.jpg", mimeType: "image/jpeg", size: 100 },
      actor: { uid: "uid-1", displayName: "Ravi" },
      auth: { festivalBelongsToPandal: true },
      // Wall-clock, because loading the queue applies the age limit against the
      // real clock — a fixture stamped at epoch 1s would load as expired.
      now: Date.now(),
    }),
    ...overrides,
  };
}

type Recorder = UploadWorkerDeps & {
  uploads: string[];
  attaches: string[];
  removed: string[];
  discarded: string[];
};

function deps(overrides: Partial<UploadWorkerDeps> = {}): Recorder {
  const uploads: string[] = [];
  const attaches: string[] = [];
  const removed: string[] = [];
  const discarded: string[] = [];
  return {
    uploads,
    attaches,
    removed,
    discarded,
    now: () => 10_000,
    currentUid: () => "uid-1",
    isOnline: () => true,
    fileExists: () => true,
    discardFile: (uri) => discarded.push(uri),
    upload: async (entry) => {
      uploads.push(entry.id);
      return META;
    },
    attach: async (entry) => {
      attaches.push(entry.id);
      return undefined;
    },
    removeObject: async (_entry, path) => {
      removed.push(path);
    },
    persist: putUploadJob,
    ...overrides,
  } as Recorder;
}

beforeEach(() => {
  disk.clear();
  resetUploadQueueStoreForTests();
  resetUploadWorkerForTests();
});

describe("processUploadJob", () => {
  it("uploads, attaches, then reports success and reclaims the staged file", async () => {
    const d = deps();
    const settled = await processUploadJob(markUploading(job()), d);
    expect(settled.state).toBe("UPLOADED");
    expect(settled.uploaded?.path).toBe(META.path);
    expect(d.uploads).toHaveLength(1);
    expect(d.attaches).toHaveLength(1);
    expect(d.discarded).toEqual(["file:///q/exp-1.jpg"]);
  });

  it("does not report success, or discard the photo, when the attach fails", async () => {
    const d = deps({
      attach: async () => {
        throw new Error("Storage is unavailable right now.");
      },
    });
    const settled = await processUploadJob(markUploading(job()), d);
    expect(settled.state).toBe("RETRYING");
    expect(d.discarded).toEqual([]);
  });

  it("never uploads the same bytes twice when only the attach failed", async () => {
    const d = deps();
    // A job that already carries uploaded metadata is resuming after an attach
    // failure — the object is in the bucket and must not be re-sent.
    const settled = await processUploadJob(markUploading(job({ uploaded: META })), d);
    expect(d.uploads).toEqual([]);
    expect(d.attaches).toHaveLength(1);
    expect(settled.state).toBe("UPLOADED");
  });

  it("records the uploaded object before attempting the attach", async () => {
    const persisted: GaneshUploadJob[] = [];
    const d = deps({
      persist: async (entry) => {
        persisted.push(entry);
        return putUploadJob(entry);
      },
      attach: async () => {
        throw new Error("No internet connection.");
      },
    });
    await processUploadJob(markUploading(job()), d);
    // The mid-flight write is what lets a crash here resume at the attach.
    expect(persisted.at(-1)?.uploaded?.path).toBe(META.path);
  });

  it("reclaims the object a replaced photo left behind", async () => {
    const previous = "pandals/pandal-1/festivals/fest-1/expenses/exp-1/old.jpg";
    const d = deps({ attach: async () => previous });
    await processUploadJob(markUploading(job()), d);
    expect(d.removed).toEqual([previous]);
  });

  it("does not delete the object it just wrote when the path is unchanged", async () => {
    const d = deps({ attach: async () => META.path });
    await processUploadJob(markUploading(job()), d);
    expect(d.removed).toEqual([]);
  });

  it("fails a job whose staged photo is gone rather than retrying it", async () => {
    const d = deps({ fileExists: () => false });
    const settled = await processUploadJob(markUploading(job()), d);
    expect(settled.state).toBe("FAILED");
    expect(settled.failureReason).toBe("fileMissing");
    expect(d.uploads).toEqual([]);
  });

  it("surfaces a permanent provider failure instead of burning retries", async () => {
    const d = deps({
      upload: async () => {
        throw new Error("You do not have permission to store this file.");
      },
    });
    const settled = await processUploadJob(markUploading(job()), d);
    expect(settled.state).toBe("FAILED");
    expect(settled.failureReason).toBe("permanent");
    expect(settled.lastError).toContain("permission");
  });

  it("gives up once the attempts are spent", async () => {
    const d = deps({
      upload: async () => {
        throw new Error("No internet connection.");
      },
    });
    const settled = await processUploadJob(
      markUploading(job({ attempts: MAX_ATTEMPTS - 1 })),
      d
    );
    expect(settled.state).toBe("FAILED");
    expect(settled.failureReason).toBe("exhausted");
  });
});

describe("runUploadQueue", () => {
  it("drains a queue read back from disk after a restart", async () => {
    await putUploadJob(job());
    resetUploadQueueStoreForTests(); // process killed and relaunched

    const d = deps();
    const result = await runUploadQueue(d);
    expect(result.uploaded).toBe(1);
    expect((await loadUploadJobs())[0].state).toBe("UPLOADED");
  });

  it("does nothing while offline, and reports when to come back", async () => {
    await putUploadJob(job({ state: "RETRYING", nextAttemptAt: 99_000 }));
    const d = deps({ isOnline: () => false });
    const result = await runUploadQueue(d);
    expect(result.processed).toBe(0);
    expect(d.uploads).toEqual([]);
    expect(result.nextWakeAt).toBe(99_000);
  });

  it("leaves another account's jobs alone", async () => {
    await putUploadJob(job({ actor: { uid: "someone-else", displayName: "Other" } }));
    const d = deps();
    await runUploadQueue(d);
    expect(d.uploads).toEqual([]);
    expect((await loadUploadJobs())[0].state).toBe("PENDING");
  });

  it("skips a retry that is not yet due", async () => {
    await putUploadJob(job({ state: "RETRYING", nextAttemptAt: 20_000 }));
    const d = deps();
    await runUploadQueue(d);
    expect(d.uploads).toEqual([]);
  });

  it("runs one pass at a time, so a second wake cannot double-upload", async () => {
    await putUploadJob(job());
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const d = deps({
      upload: async (entry) => {
        d.uploads.push(entry.id);
        await gate;
        return META;
      },
    });
    const first = runUploadQueue(d);
    const second = runUploadQueue(d);
    release?.();
    await Promise.all([first, second]);
    expect(d.uploads).toHaveLength(1);
  });

  it("re-opens a job whose attach fails after being reported as queued", async () => {
    await putUploadJob(job());
    const d = deps({
      // `commitWrite` resolves once the write is durably queued and reports a
      // later failure through the hook — here, before the worker has finished
      // writing UPLOADED, which is the ordering that used to lose the failure.
      attach: async (_entry, _meta, onLateFailure) => {
        onLateFailure(new Error("Storage is unavailable right now."));
        return undefined;
      },
    });
    await runUploadQueue(d);

    const [settled] = await loadUploadJobs();
    expect(settled.state).toBe("RETRYING");
    expect(settled.uploaded?.path).toBe(META.path);
  });

  it("marks the claim before the request goes out", async () => {
    await putUploadJob(job());
    const seen: string[] = [];
    const d = deps({
      upload: async () => {
        seen.push((await loadUploadJobs())[0].state);
        return META;
      },
    });
    await runUploadQueue(d);
    expect(seen).toEqual(["UPLOADING"]);
  });
});
