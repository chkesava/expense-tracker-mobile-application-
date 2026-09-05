/**
 * The durable photo upload queue — public API (GS-040).
 *
 * The contract callers depend on: **`enqueueGaneshUpload` resolves only when the
 * photo is genuinely safe.** The bytes have been copied out of the picker's
 * reclaimable cache into app storage, and the job describing them has been
 * written to disk. Anything short of that rejects, so no screen ever gets to
 * tell the user their receipt is queued on the strength of something that only
 * existed in memory.
 *
 * After that the photo is the queue's problem, not the screen's. Leaving the
 * screen, backgrounding the app, losing the connection or killing the process
 * are all survivable; the worker picks the job up on the next run.
 */

import { logWarning } from "@/lib/errors";
import {
  assertCanUpload,
  assertCanUploadPandalAsset,
  assertCanUploadPandalSponsor,
} from "@/services/ganesh/storage/storageAuth";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import {
  createUploadJob,
  markCancelled,
  uploadJobId,
  type GaneshUploadAuthContext,
  type GaneshUploadJob,
  type GaneshUploadTarget,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
import {
  currentUploadJobs,
  findUploadJob,
  loadUploadJobs,
  mutateUploadJobs,
  putUploadJob,
  removeUploadJob,
  subscribeUploadJobs,
} from "@/services/ganesh/storage/uploadQueue/uploadJobStore";
import { discardStagedFile, stageUploadFile } from "@/services/ganesh/storage/uploadQueue/uploadStaging";
import { removeJobObject, UPLOAD_TARGET_LABEL } from "@/services/ganesh/storage/uploadQueue/uploadTargets";

export {
  COMPLETED_RETENTION_MS,
  MAX_ATTEMPTS,
  isTerminalUploadState,
  uploadJobId,
  type GaneshUploadFailureReason,
  type GaneshUploadJob,
  type GaneshUploadJobState,
  type GaneshUploadTarget,
  type GaneshUploadTargetKind,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
export {
  currentUploadJobs,
  loadUploadJobs,
  subscribeUploadJobs,
} from "@/services/ganesh/storage/uploadQueue/uploadJobStore";
export { UPLOAD_TARGET_LABEL } from "@/services/ganesh/storage/uploadQueue/uploadTargets";

/**
 * Set by the queue driver so an enqueue starts uploading immediately instead of
 * waiting for the next network change. Absent (in a test, or before the driver
 * mounts) it simply means the job waits — never that it is lost.
 */
let kick: (() => void) | null = null;

export function setUploadQueueKick(next: (() => void) | null): void {
  kick = next;
}

/**
 * Refuse work the user is not allowed to do, here rather than six retries
 * later. Same assertions `storageService` runs on the way out, so the message
 * is the same one the direct upload used to give.
 */
function assertCanQueue(target: GaneshUploadTarget, auth: GaneshUploadAuthContext, uid: string) {
  const shared = {
    uid,
    role: auth.role,
    permissions: auth.permissions,
    memberStatus: auth.memberStatus,
    sessionPandalId: target.pandalId,
    pandalId: target.pandalId,
  };
  switch (target.kind) {
    case "expenseReceipt":
    case "contributionPhoto":
      assertCanUpload({
        ...shared,
        sessionFestivalId: target.festivalId,
        festivalId: target.festivalId,
        category: target.kind === "expenseReceipt" ? "expenses" : "contributions",
        festivalBelongsToPandal: auth.festivalBelongsToPandal,
      });
      return;
    case "assetPhoto":
      assertCanUploadPandalAsset(shared);
      return;
    case "sponsorPhoto":
      assertCanUploadPandalSponsor(shared);
  }
}

/**
 * Clean up what a replaced job leaves behind.
 *
 * A staged file always goes. An uploaded object only goes when the replacement
 * will land somewhere else — the storage path ends in the file name, so a JPEG
 * replacing a JPEG overwrites in place and deleting it would remove the very
 * object the new job is about to write.
 */
async function releaseReplacedJob(
  previous: GaneshUploadJob,
  nextFileName: string
): Promise<void> {
  discardStagedFile(previous.file.uri);
  const uploadedPath = previous.uploaded?.path;
  if (!uploadedPath) return;
  if (uploadedPath.endsWith(`/${nextFileName}`)) return;
  await removeJobObject(previous.target, uploadedPath).catch((error) => {
    logWarning("ganesh.uploadQueue.replacedOrphan", error, { path: uploadedPath });
  });
}

export type EnqueueGaneshUploadInput = {
  target: GaneshUploadTarget;
  file: PreparedGaneshImage;
  actor: { uid: string; displayName: string; phone?: string };
  auth: GaneshUploadAuthContext;
};

/**
 * Stage the photo, persist the job, and wake the worker.
 *
 * Rejects if the user may not upload, if the photo cannot be staged, or if the
 * job cannot be written — the three ways "it is queued" could be a lie.
 */
export async function enqueueGaneshUpload(
  input: EnqueueGaneshUploadInput
): Promise<GaneshUploadJob> {
  if (!input.actor.uid) throw new Error("You must be signed in.");
  assertCanQueue(input.target, input.auth, input.actor.uid);

  const id = uploadJobId(input.target);
  const previous = (await loadUploadJobs()).find((job) => job.id === id);

  const file = await stageUploadFile(id, input.file);
  const job = createUploadJob({
    target: input.target,
    file,
    actor: input.actor,
    auth: input.auth,
  });

  try {
    await putUploadJob(job);
  } catch (error) {
    // The record did not land, so nothing may claim the photo is queued. Take
    // the staged copy back out rather than leaving an unreferenced file behind.
    discardStagedFile(file.uri);
    throw error;
  }

  if (previous && previous.file.uri !== file.uri) {
    await releaseReplacedJob(previous, file.fileName);
  }
  kick?.();
  return job;
}

/** The job for a slot, if the queue is still carrying one. */
export function uploadJobFor(target: GaneshUploadTarget): GaneshUploadJob | undefined {
  const id = uploadJobId(target);
  return currentUploadJobs().find((job) => job.id === id);
}

/**
 * A user-initiated retry of a job that gave up.
 *
 * The attempt count resets: the person has looked at the failure and decided
 * conditions have changed, and holding them to the backoff of a queue that had
 * already stopped trying would just be pedantry.
 */
export async function retryGaneshUploadJob(id: string): Promise<void> {
  await mutateUploadJobs((jobs) =>
    jobs.map((job) =>
      job.id === id && (job.state === "FAILED" || job.state === "RETRYING")
        ? {
            ...job,
            state: "PENDING" as const,
            attempts: 0,
            nextAttemptAt: undefined,
            lastError: undefined,
            failureReason: undefined,
            updatedAt: Date.now(),
          }
        : job
    )
  );
  kick?.();
}

/**
 * Withdraw a job the user no longer wants uploaded.
 *
 * An already-attached job is past cancelling — the record has the photo — so
 * that only drops the queue entry. Anything earlier also reclaims the staged
 * file and, if the bytes made it to the bucket without ever being attached, the
 * orphaned object.
 */
export async function cancelGaneshUploadJob(id: string): Promise<void> {
  const job = await findUploadJob(id);
  if (!job) return;
  if (job.state === "UPLOADED") {
    await removeUploadJob(id);
    return;
  }
  await mutateUploadJobs((jobs) =>
    jobs.map((entry) => (entry.id === id ? markCancelled(entry) : entry))
  );
  discardStagedFile(job.file.uri);
  if (job.uploaded?.path) {
    await removeJobObject(job.target, job.uploaded.path).catch((error) => {
      logWarning("ganesh.uploadQueue.cancelOrphan", error, { path: job.uploaded?.path });
    });
  }
  await removeUploadJob(id);
}

/** Drops a finished job the user has acknowledged, without touching Storage. */
export async function dismissGaneshUploadJob(id: string): Promise<void> {
  await removeUploadJob(id);
}

/** Copy for a failure the user has to act on. */
export function uploadFailureNotice(job: GaneshUploadJob): string {
  const label = UPLOAD_TARGET_LABEL[job.target.kind];
  const reason = job.lastError ?? "It could not be uploaded.";
  return `Your ${label} was not uploaded. ${reason}`;
}

export { subscribeUploadJobs as subscribeGaneshUploadQueue };
