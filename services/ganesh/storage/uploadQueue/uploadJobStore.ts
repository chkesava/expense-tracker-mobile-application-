/**
 * Where upload jobs actually live (GS-040).
 *
 * AsyncStorage, following the same shape as the SMS stores — with one
 * deliberate difference: **a failed write is not swallowed here.**
 *
 * Those stores fall back to memory-only on a storage error because losing a
 * dedupe key costs nothing. Losing a job record costs the user their photo
 * while the app has already told them it is safely queued, which is the one
 * thing GS-040 says must never happen. So `mutateUploadJobs` rejects, and
 * `enqueueGaneshUpload` turns that into a failure the user is told about
 * instead of a promise the app cannot keep.
 *
 * Every mutation is a serialized read-modify-write. The worker, the UI and a
 * fresh enqueue all touch this list, and a plain read-then-write would let a
 * slow worker transition overwrite a cancel the user made in between.
 */

import {
  GANESH_UPLOAD_QUEUE_VERSION,
  reconcileLoadedJobs,
  type GaneshUploadJob,
  type GaneshUploadJobState,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";

export const UPLOAD_QUEUE_STORAGE_KEY = "ganesh_upload_queue_v1";

/**
 * A cap, because this queue holds pointers to staged image files. A runaway
 * queue is a runaway disk footprint, and a device that fills up is a device
 * that cannot save the ledger row either. Oldest non-terminal jobs win.
 */
const MAX_JOBS = 100;

let memoryJobs: GaneshUploadJob[] | null = null;
let loadPromise: Promise<GaneshUploadJob[]> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

type QueueListener = (jobs: GaneshUploadJob[]) => void;
const listeners = new Set<QueueListener>();

function notify(jobs: GaneshUploadJob[]): void {
  for (const listener of listeners) {
    try {
      listener(jobs);
    } catch {
      /* a bad subscriber must not break the queue */
    }
  }
}

export function subscribeUploadJobs(listener: QueueListener): () => void {
  listeners.add(listener);
  if (memoryJobs) listener(memoryJobs);
  return () => {
    listeners.delete(listener);
  };
}

/** Synchronous snapshot for render paths. Empty until the first load resolves. */
export function currentUploadJobs(): GaneshUploadJob[] {
  return memoryJobs ?? [];
}

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

const VALID_STATES: GaneshUploadJobState[] = [
  "PENDING",
  "UPLOADING",
  "UPLOADED",
  "RETRYING",
  "FAILED",
  "CANCELLED",
];

/**
 * Anything that does not parse as a job is dropped rather than repaired.
 *
 * A half-understood job would be handed to the worker, which would hand a
 * malformed path to the provider — better to lose one unreadable record than
 * to act on a guess about what the user meant to upload.
 */
function isUploadJob(value: unknown): value is GaneshUploadJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<GaneshUploadJob>;
  return (
    typeof job.id === "string"
    && typeof job.createdAt === "number"
    && typeof job.updatedAt === "number"
    && typeof job.attempts === "number"
    && typeof job.state === "string"
    && VALID_STATES.includes(job.state as GaneshUploadJobState)
    && Boolean(job.target && typeof job.target === "object" && typeof job.target.kind === "string")
    && Boolean(job.file && typeof job.file === "object" && typeof job.file.uri === "string")
    && Boolean(job.actor && typeof job.actor === "object" && typeof job.actor.uid === "string")
  );
}

function parseJobs(raw: string | null): GaneshUploadJob[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isUploadJob)
      .filter((job) => (job.version ?? 0) <= GANESH_UPLOAD_QUEUE_VERSION);
  } catch {
    return [];
  }
}

function trim(jobs: GaneshUploadJob[]): GaneshUploadJob[] {
  if (jobs.length <= MAX_JOBS) return jobs;
  return [...jobs].sort((a, b) => a.createdAt - b.createdAt).slice(jobs.length - MAX_JOBS);
}

async function persist(jobs: GaneshUploadJob[]): Promise<void> {
  const AsyncStorage = await getStorage();
  await AsyncStorage.setItem(UPLOAD_QUEUE_STORAGE_KEY, JSON.stringify(jobs));
}

/**
 * Reads the queue, applying `reconcileLoadedJobs` once per process.
 *
 * The reconciliation is written straight back: a restart that revives a job
 * stranded in `UPLOADING` has to survive a second restart too, and a crash
 * between the revive and the next mutation would otherwise put it right back
 * where it was.
 */
export async function loadUploadJobs(): Promise<GaneshUploadJob[]> {
  if (memoryJobs) return memoryJobs;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let stored: GaneshUploadJob[] = [];
    try {
      const AsyncStorage = await getStorage();
      stored = parseJobs(await AsyncStorage.getItem(UPLOAD_QUEUE_STORAGE_KEY));
    } catch {
      stored = [];
    }
    const reconciled = trim(reconcileLoadedJobs(stored));
    memoryJobs = reconciled;
    const changed =
      reconciled.length !== stored.length
      || reconciled.some((job, index) => job.state !== stored[index]?.state);
    if (changed) {
      // Best effort: an unwritable reconciliation still leaves a correct queue
      // in memory for this run, and the next successful mutation persists it.
      await persist(reconciled).catch(() => undefined);
    }
    notify(reconciled);
    return reconciled;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * Serialized read-modify-write over the whole queue.
 *
 * Rejects if the queue could not be written, leaving memory untouched, so a
 * caller can never report a job as durably queued on the strength of a write
 * that did not happen.
 */
export async function mutateUploadJobs(
  update: (jobs: GaneshUploadJob[]) => GaneshUploadJob[]
): Promise<GaneshUploadJob[]> {
  const run = writeChain.then(async () => {
    const current = await loadUploadJobs();
    const next = trim(update(current));
    await persist(next);
    memoryJobs = next;
    notify(next);
    return next;
  });
  // Keep the chain alive after a rejection, or one storage error would wedge
  // every later mutation behind it.
  writeChain = run.catch(() => undefined);
  return run;
}

export async function putUploadJob(job: GaneshUploadJob): Promise<GaneshUploadJob[]> {
  return mutateUploadJobs((jobs) => {
    const index = jobs.findIndex((existing) => existing.id === job.id);
    if (index < 0) return [...jobs, job];
    const next = [...jobs];
    next[index] = job;
    return next;
  });
}

export async function removeUploadJob(id: string): Promise<GaneshUploadJob[]> {
  return mutateUploadJobs((jobs) => jobs.filter((job) => job.id !== id));
}

export async function findUploadJob(id: string): Promise<GaneshUploadJob | undefined> {
  const jobs = await loadUploadJobs();
  return jobs.find((job) => job.id === id);
}

/** Test helper — drops in-memory state so the next load re-reads storage. */
export function resetUploadQueueStoreForTests(): void {
  memoryJobs = null;
  loadPromise = null;
  writeChain = Promise.resolve();
  listeners.clear();
}
