import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUploadJob,
  type GaneshUploadJob,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
import {
  currentUploadJobs,
  loadUploadJobs,
  mutateUploadJobs,
  putUploadJob,
  removeUploadJob,
  resetUploadQueueStoreForTests,
  subscribeUploadJobs,
  UPLOAD_QUEUE_STORAGE_KEY,
} from "@/services/ganesh/storage/uploadQueue/uploadJobStore";

const disk = new Map<string, string>();
let failWrites = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failWrites) throw new Error("disk full");
      disk.set(key, value);
    },
  },
}));

function job(id: string, overrides: Partial<GaneshUploadJob> = {}): GaneshUploadJob {
  const base = createUploadJob({
    target: { kind: "assetPhoto", pandalId: "pandal-1", recordId: id },
    file: { uri: `file:///q/${id}.jpg`, fileName: "photo.jpg", mimeType: "image/jpeg", size: 10 },
    actor: { uid: "uid-1", displayName: "Ravi" },
    auth: { festivalBelongsToPandal: false },
  });
  return { ...base, ...overrides };
}

beforeEach(() => {
  disk.clear();
  failWrites = false;
  resetUploadQueueStoreForTests();
});

describe("uploadJobStore", () => {
  it("persists a job and reads it back after a restart", async () => {
    await putUploadJob(job("a"));
    resetUploadQueueStoreForTests(); // as if the process had been killed

    const loaded = await loadUploadJobs();
    expect(loaded.map((entry) => entry.id)).toEqual([job("a").id]);
    expect(disk.get(UPLOAD_QUEUE_STORAGE_KEY)).toContain("assetPhoto");
  });

  it("revives a job stranded in UPLOADING and writes the revival back", async () => {
    await putUploadJob(job("a", { state: "UPLOADING" }));
    resetUploadQueueStoreForTests();

    const [revived] = await loadUploadJobs();
    expect(revived.state).toBe("PENDING");
    // Persisted, so a second crash does not undo it.
    expect(disk.get(UPLOAD_QUEUE_STORAGE_KEY)).toContain("PENDING");
  });

  it("rejects rather than reporting a job as queued when the write fails", async () => {
    failWrites = true;
    await expect(putUploadJob(job("a"))).rejects.toThrow("disk full");
    // Nothing may be visible as queued, in memory or on disk.
    expect(currentUploadJobs()).toEqual([]);
    expect(disk.has(UPLOAD_QUEUE_STORAGE_KEY)).toBe(false);
  });

  it("keeps accepting mutations after a failed write", async () => {
    failWrites = true;
    await expect(putUploadJob(job("a"))).rejects.toThrow();
    failWrites = false;
    await putUploadJob(job("b"));
    expect((await loadUploadJobs()).map((entry) => entry.id)).toEqual([job("b").id]);
  });

  it("serializes concurrent mutations instead of losing one", async () => {
    await Promise.all([putUploadJob(job("a")), putUploadJob(job("b")), putUploadJob(job("c"))]);
    expect((await loadUploadJobs()).length).toBe(3);
  });

  it("replaces rather than duplicates a job with the same id", async () => {
    await putUploadJob(job("a"));
    await putUploadJob(job("a", { state: "RETRYING", attempts: 3 }));
    const loaded = await loadUploadJobs();
    expect(loaded.length).toBe(1);
    expect(loaded[0].attempts).toBe(3);
  });

  it("drops records that do not parse as jobs", async () => {
    disk.set(
      UPLOAD_QUEUE_STORAGE_KEY,
      JSON.stringify([{ id: "junk" }, { nonsense: true }, job("a")])
    );
    expect((await loadUploadJobs()).map((entry) => entry.id)).toEqual([job("a").id]);
  });

  it("survives an unparseable queue without throwing", async () => {
    disk.set(UPLOAD_QUEUE_STORAGE_KEY, "{not json");
    expect(await loadUploadJobs()).toEqual([]);
  });

  it("notifies subscribers on every change", async () => {
    const seen: number[] = [];
    const unsubscribe = subscribeUploadJobs((jobs) => seen.push(jobs.length));
    await putUploadJob(job("a"));
    await putUploadJob(job("b"));
    await removeUploadJob(job("a").id);
    unsubscribe();
    await putUploadJob(job("c"));
    expect(seen).toEqual([0, 1, 2, 1]);
  });

  it("applies a mutation to the whole queue at once", async () => {
    await putUploadJob(job("a"));
    await putUploadJob(job("b"));
    const next = await mutateUploadJobs((jobs) =>
      jobs.map((entry) => ({ ...entry, state: "RETRYING" as const, nextAttemptAt: 42 }))
    );
    expect(next.every((entry) => entry.state === "RETRYING")).toBe(true);
  });
});
