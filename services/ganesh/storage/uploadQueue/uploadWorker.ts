/**
 * The upload worker (GS-040).
 *
 * One job at a time, single-flight across the whole app: a second `runUploadQueue`
 * while one is in progress joins the run already going rather than starting a
 * rival pass over the same jobs. Network changes, foregrounding, and a fresh
 * enqueue all poke the same door.
 *
 * The order of persistence here is the part that matters, and it is deliberate:
 *
 *  1. `UPLOADING` is written **before** the request goes out, so a crash mid-flight
 *     leaves a job that the next launch can see and revive.
 *  2. The uploaded object's metadata is written **before** the Firestore attach,
 *     so a crash in between resumes at the attach rather than re-sending bytes
 *     the user already paid for.
 *  3. `UPLOADED` is written **only after** the attach, so a job is never called
 *     done while the record still has no photo on it — and the staged file is
 *     deleted only at that point.
 *
 * Every dependency is injected. That keeps the state machine testable in plain
 * Node, and it keeps this module free of native imports: the real dependencies
 * are pulled in lazily by `runUploadQueue`.
 */

import { friendlyErrorMessage, logError, logWarning } from "@/lib/errors";
import {
  applyFailedAttempt,
  dueUploadJobs,
  markFailed,
  markObjectUploaded,
  markUploaded,
  markUploading,
  nextWakeAt,
  type GaneshUploadJob,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
import {
  loadUploadJobs,
  mutateUploadJobs,
  putUploadJob,
} from "@/services/ganesh/storage/uploadQueue/uploadJobStore";
import type { GaneshFileMeta } from "@/shared/types/ganesh";

export type UploadWorkerDeps = {
  now: () => number;
  /** The signed-in Firebase uid, or null. */
  currentUid: () => string | null;
  /** Whether the device believes it has a connection. */
  isOnline: () => boolean;
  fileExists: (uri: string) => boolean;
  discardFile: (uri: string) => void;
  upload: (job: GaneshUploadJob) => Promise<GaneshFileMeta>;
  attach: (
    job: GaneshUploadJob,
    meta: GaneshFileMeta,
    onLateFailure: (error: unknown) => void
  ) => Promise<string | undefined>;
  removeObject: (job: GaneshUploadJob, path: string) => Promise<void>;
  /** Persists an intermediate transition. */
  persist: (job: GaneshUploadJob) => Promise<unknown>;
};

export type UploadRunResult = {
  processed: number;
  uploaded: number;
  failed: number;
  /** Epoch ms the caller should wake the worker again, if anything is waiting. */
  nextWakeAt?: number;
};

/**
 * Runs one job that is already marked `UPLOADING` and returns the state it
 * should be left in. Never throws — a job that cannot be reasoned about is a
 * job that gets retried or failed, not one that takes the queue down with it.
 */
export async function processUploadJob(
  job: GaneshUploadJob,
  deps: UploadWorkerDeps
): Promise<GaneshUploadJob> {
  const now = deps.now();
  try {
    let meta = job.uploaded;
    if (!meta) {
      if (!deps.fileExists(job.file.uri)) {
        // Nothing to send and nothing that a retry could recover. Say so
        // plainly rather than burning six attempts on an absent file.
        return markFailed(job, {
          message: "The photo is no longer saved on this device. Add it again from the record.",
          reason: "fileMissing",
          now,
        });
      }
      meta = await deps.upload(job);
      // Step 2 above: the bytes are in the bucket. Record that before the
      // attach, so a crash from here on resumes without re-uploading.
      await deps.persist(markObjectUploaded(job, meta));
    }

    const previousPath = await deps.attach(job, meta, (error) => {
      // `commitWrite` reports the attach as queued after ~1.5s and delivers any
      // later failure here instead of rejecting. Put the job back in the queue
      // rather than leaving the user with a record that silently lost its photo
      // — the object is already uploaded, so the retry is just the attach.
      void reopenUploadJob(job.id, error);
    });

    if (previousPath && previousPath !== meta.path) {
      // The photo this one replaced is now unreferenced (GS-069).
      await deps
        .removeObject(job, previousPath)
        .catch((error) => logWarning("ganesh.uploadQueue.replacedObject", error));
    }

    deps.discardFile(job.file.uri);
    return markUploaded(job, meta, deps.now());
  } catch (error) {
    logError("ganesh.uploadQueue.attempt", error, { jobId: job.id, attempts: job.attempts });
    return applyFailedAttempt(job, {
      error,
      message: friendlyErrorMessage(error, "The photo could not be uploaded."),
      now: deps.now(),
    });
  }
}

/**
 * Late attach failures, held until the job they belong to is settled on disk.
 *
 * `commitWrite` reports an attach as queued after ~1.5s and delivers any later
 * failure through its `onLateFailure` hook. That hook can fire at any moment —
 * including while the worker is still writing `UPLOADED` for the same job, in
 * which case re-opening the job immediately would simply be overwritten a
 * microtask later and the user would be left with a record that silently lost
 * its photo. So the failure is recorded, then applied both now and again once
 * the worker has finished persisting, and whichever ordering happens wins the
 * same way.
 */
const lateFailures = new Map<string, unknown>();

/**
 * Puts a job back in the queue when its attach failed after being reported as
 * queued. Only touches a job sitting in `UPLOADED`; if the user has since
 * cancelled it, or a newer photo replaced it, the newer state wins. The object
 * is already in the bucket, so the retry is just the attach.
 */
export async function reopenUploadJob(id: string, error: unknown): Promise<void> {
  logWarning("ganesh.uploadQueue.lateAttachFailure", error, { jobId: id });
  lateFailures.set(id, error);
  await applyLateFailure(id);
}

async function applyLateFailure(id: string): Promise<void> {
  const error = lateFailures.get(id);
  if (error === undefined) return;
  let handled = false;
  await mutateUploadJobs((jobs) =>
    jobs.map((job) => {
      if (job.id !== id) return job;
      // Still `UPLOADING` means the worker has not written its outcome yet;
      // leave the failure queued and let the post-persist pass apply it.
      if (job.state !== "UPLOADED") {
        if (job.state !== "UPLOADING") handled = true; // cancelled or replaced
        return job;
      }
      handled = true;
      return applyFailedAttempt(
        { ...job, state: "RETRYING" },
        { error, message: friendlyErrorMessage(error, "The photo could not be attached.") }
      );
    })
  ).catch((persistError) => {
    logError("ganesh.uploadQueue.reopenFailed", persistError, { jobId: id });
    handled = true; // nothing more this run can do about it
  });
  if (handled) lateFailures.delete(id);
}

let inFlight: Promise<UploadRunResult> | null = null;

/**
 * Drains every due job, then reports when to come back.
 *
 * Sequential on purpose. These are phone uploads on a pandal's shared
 * connection; three at once is slower than three in a row and makes each one
 * more likely to time out.
 */
export async function runUploadQueue(deps: UploadWorkerDeps): Promise<UploadRunResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result: UploadRunResult = { processed: 0, uploaded: 0, failed: 0 };
    try {
      const uid = deps.currentUid();
      const jobs = await loadUploadJobs();
      if (!uid || !deps.isOnline()) {
        result.nextWakeAt = nextWakeAt(jobs);
        return result;
      }
      for (const candidate of dueUploadJobs(jobs, deps.now())) {
        // Jobs belonging to another account stay dormant rather than running
        // under the wrong identity — the Edge Function would refuse them, and
        // burning attempts on that would fail a photo its real owner could
        // still upload after signing back in.
        if (candidate.actor.uid !== uid) continue;
        if (!deps.isOnline()) break;

        const claimed = markUploading(candidate, deps.now());
        try {
          await deps.persist(claimed);
        } catch (error) {
          // The claim could not be recorded, so running the job would risk a
          // second upload on the next pass. Leave it for later.
          logError("ganesh.uploadQueue.claimFailed", error, { jobId: claimed.id });
          continue;
        }

        const settled = await processUploadJob(claimed, deps);
        result.processed += 1;
        if (settled.state === "UPLOADED") result.uploaded += 1;
        if (settled.state === "FAILED") result.failed += 1;
        try {
          await deps.persist(settled);
        } catch (error) {
          // In memory the job is correct; on disk it is still `UPLOADING` and
          // the next launch will revive it. For an already-uploaded object that
          // costs one redundant attach, not a duplicate upload.
          logError("ganesh.uploadQueue.persistFailed", error, { jobId: settled.id });
        }
        // A late attach failure that arrived while the write above was in
        // flight would otherwise have been overwritten by it.
        await applyLateFailure(settled.id);
      }
      result.nextWakeAt = nextWakeAt(await loadUploadJobs());
      return result;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * The real dependencies, wired lazily so importing the worker never pulls in a
 * native module — the tests, and any non-device caller, stay in plain Node.
 */
export async function defaultUploadWorkerDeps(input: {
  currentUid: () => string | null;
  isOnline: () => boolean;
}): Promise<UploadWorkerDeps> {
  const staging = await import("@/services/ganesh/storage/uploadQueue/uploadStaging");
  const targets = await import("@/services/ganesh/storage/uploadQueue/uploadTargets");
  return {
    now: () => Date.now(),
    currentUid: input.currentUid,
    isOnline: input.isOnline,
    fileExists: staging.stagedFileExists,
    discardFile: staging.discardStagedFile,
    upload: targets.uploadJobObject,
    attach: targets.attachJobObject,
    removeObject: (job, path) => targets.removeJobObject(job.target, path),
    persist: putUploadJob,
  };
}

/** Test helper — clears the single-flight guard between runs. */
export function resetUploadWorkerForTests(): void {
  inFlight = null;
  lateFailures.clear();
}
