/**
 * The durable photo upload job — its shape, its identity, and the pure rules
 * that move it between states (GS-040).
 *
 * Everything in this file is a pure function over a plain object, so the queue's
 * actual behaviour — what retries, what gives up, what a second enqueue of the
 * same photo does — is testable without a device, a network or a clock.
 *
 * Why a job at all, when `useGaneshStorage` already uploads: because that upload
 * lives and dies with the screen that started it. Leave the screen, background
 * the app, or lose the connection for longer than the user is willing to stare
 * at a spinner, and the photo is gone with no record that it was ever meant to
 * be uploaded. The record *is* the feature.
 */

import { classifyError, errorCode } from "@/lib/errors";
import type { AllowedImageType } from "@/services/ganesh/storage/storageTypes";
import type { GaneshFileMeta, GaneshRole } from "@/shared/types/ganesh";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";

export const GANESH_UPLOAD_QUEUE_VERSION = 1;

export type GaneshUploadJobState =
  /** Persisted and waiting for a worker. The only state a fresh job may have. */
  | "PENDING"
  /** Claimed by the worker in this process. Never trusted across a restart. */
  | "UPLOADING"
  /** Bytes in the bucket *and* the record pointing at them. Terminal. */
  | "UPLOADED"
  /** Transient failure; `nextAttemptAt` says when it becomes due again. */
  | "RETRYING"
  /** Permanently failed. Terminal until the user retries by hand. */
  | "FAILED"
  /** Withdrawn by the user. Terminal. */
  | "CANCELLED";

const TERMINAL_STATES: GaneshUploadJobState[] = ["UPLOADED", "FAILED", "CANCELLED"];

export function isTerminalUploadState(state: GaneshUploadJobState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * What the photo is *for*. This is the job's identity, not a payload detail:
 * every one of these slots holds exactly one image, so a second photo for the
 * same slot replaces the first rather than racing it.
 */
export type GaneshUploadTarget =
  | { kind: "expenseReceipt"; pandalId: string; festivalId: string; recordId: string }
  | { kind: "contributionPhoto"; pandalId: string; festivalId: string; recordId: string }
  | { kind: "assetPhoto"; pandalId: string; recordId: string }
  | { kind: "sponsorPhoto"; pandalId: string; recordId: string };

export type GaneshUploadTargetKind = GaneshUploadTarget["kind"];

/**
 * The authorization context as it stood when the user picked the photo.
 *
 * Persisted rather than re-derived, because the worker runs outside React and
 * may run days later. It is a *client-side* gate only — the `ganesh-files` Edge
 * Function re-verifies the caller's Firebase token against Firestore on every
 * single attempt, so a stale role here cannot widen access; it can only fail an
 * upload the server would have refused anyway.
 */
export type GaneshUploadAuthContext = {
  role?: GaneshRole;
  permissions?: GaneshPermission[];
  memberStatus?: string;
  festivalBelongsToPandal: boolean;
};

export type GaneshUploadJobFile = {
  /** The staged copy in app storage — never the picker's cache URI. */
  uri: string;
  fileName: string;
  mimeType: AllowedImageType;
  size: number;
};

export type GaneshUploadFailureReason =
  /** The provider or Firestore refused in a way retrying cannot fix. */
  | "permanent"
  /** Every retry was spent on failures that looked transient. */
  | "exhausted"
  /** Sat in the queue past `MAX_JOB_AGE_MS` without ever succeeding. */
  | "expired"
  /** The staged file is gone, so there is nothing left to upload. */
  | "fileMissing";

export type GaneshUploadJob = {
  id: string;
  version: number;
  target: GaneshUploadTarget;
  file: GaneshUploadJobFile;
  actor: { uid: string; displayName: string; phone?: string };
  auth: GaneshUploadAuthContext;
  state: GaneshUploadJobState;
  /** Completed attempts, successful or not. */
  attempts: number;
  createdAt: number;
  updatedAt: number;
  /** Epoch ms this job becomes due again. Only meaningful while RETRYING. */
  nextAttemptAt?: number;
  /**
   * Set the moment the bucket confirms the bytes.
   *
   * This is what stops a duplicate upload: a job that fails at the *attach*
   * step has already spent the user's data once, and its retry resumes from
   * here rather than pushing the same image a second time.
   */
  uploaded?: GaneshFileMeta;
  /** User-facing text for the last failure. Never a raw SDK string. */
  lastError?: string;
  failureReason?: GaneshUploadFailureReason;
};

/**
 * Deterministic job id.
 *
 * Derived from the slot the photo belongs to, so enqueueing twice for the same
 * record produces one job, not two. Every segment has already been through
 * `assertSafeId` by the time a storage path is built from it, and the parts are
 * joined with a character none of them may contain.
 */
export function uploadJobId(target: GaneshUploadTarget): string {
  const festivalId = "festivalId" in target ? target.festivalId : "-";
  return `${target.kind}:${target.pandalId}:${festivalId}:${target.recordId}`;
}

// ─── Retry policy ─────────────────────────────────────────────────────────────

/**
 * Six attempts across roughly eight minutes of backoff. Past that the failure is
 * no longer plausibly a blip, and retrying forever in silence is exactly how a
 * photo goes missing without anyone being told.
 */
export const MAX_ATTEMPTS = 6;
export const RETRY_BASE_MS = 5_000;
export const RETRY_FACTOR = 3;
export const RETRY_MAX_MS = 5 * 60_000;
/** Jitter spread, so a pandal full of phones reconnecting does not sync up. */
export const RETRY_JITTER = 0.2;

/** How long an unfinished job may sit before it is failed rather than kept. */
export const MAX_JOB_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a finished job stays visible so the UI can report the outcome. */
export const COMPLETED_RETENTION_MS = 10 * 60_000;

export function retryDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const base = Math.min(RETRY_BASE_MS * RETRY_FACTOR ** exponent, RETRY_MAX_MS);
  const jitter = 1 + (random() * 2 - 1) * RETRY_JITTER;
  return Math.max(1_000, Math.round(base * jitter));
}

/**
 * Permanent failures, by the copy `friendlyStorageError` produces.
 *
 * The provider layer collapses everything it throws into a handful of fixed
 * user-facing sentences, so matching on them is matching on that layer's own
 * contract rather than on some vendor's error text. Anything unrecognised is
 * treated as transient and retried — the queue's job is not to lose photos, and
 * spending five more attempts on a genuinely permanent failure costs the user
 * nothing but a slightly later notice.
 */
const PERMANENT_MESSAGE = /too large|do not have permission|not configured|sign in again/i;

export function isPermanentUploadFailure(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "permission-denied" || code === "unauthenticated" || code === "invalid-argument") {
    return true;
  }
  const kind = classifyError(error);
  if (kind === "permission" || kind === "auth" || kind === "validation") return true;
  // A record that no longer exists will never accept this photo.
  if (kind === "notFound") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return PERMANENT_MESSAGE.test(message);
}

// ─── Transitions ──────────────────────────────────────────────────────────────

export function createUploadJob(input: {
  target: GaneshUploadTarget;
  file: GaneshUploadJobFile;
  actor: { uid: string; displayName: string; phone?: string };
  auth: GaneshUploadAuthContext;
  now?: number;
}): GaneshUploadJob {
  const now = input.now ?? Date.now();
  return {
    id: uploadJobId(input.target),
    version: GANESH_UPLOAD_QUEUE_VERSION,
    target: input.target,
    file: input.file,
    actor: input.actor,
    auth: input.auth,
    state: "PENDING",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function markUploading(job: GaneshUploadJob, now = Date.now()): GaneshUploadJob {
  return {
    ...job,
    state: "UPLOADING",
    attempts: job.attempts + 1,
    nextAttemptAt: undefined,
    updatedAt: now,
  };
}

export function markUploaded(
  job: GaneshUploadJob,
  uploaded: GaneshFileMeta,
  now = Date.now()
): GaneshUploadJob {
  return {
    ...job,
    state: "UPLOADED",
    uploaded,
    nextAttemptAt: undefined,
    lastError: undefined,
    failureReason: undefined,
    updatedAt: now,
  };
}

/** Records that the bytes landed while the attach step has not yet. */
export function markObjectUploaded(job: GaneshUploadJob, uploaded: GaneshFileMeta): GaneshUploadJob {
  return { ...job, uploaded };
}

export function markFailed(
  job: GaneshUploadJob,
  input: { message: string; reason: GaneshUploadFailureReason; now?: number }
): GaneshUploadJob {
  return {
    ...job,
    state: "FAILED",
    nextAttemptAt: undefined,
    lastError: input.message,
    failureReason: input.reason,
    updatedAt: input.now ?? Date.now(),
  };
}

export function markCancelled(job: GaneshUploadJob, now = Date.now()): GaneshUploadJob {
  return { ...job, state: "CANCELLED", nextAttemptAt: undefined, updatedAt: now };
}

/**
 * Retry with backoff, or give up and say so.
 *
 * Exhausting the attempts and hitting a permanent error land in the same place
 * deliberately — from the user's side both mean "this photo is not going to
 * upload on its own", and that is the thing they need to be told.
 */
export function applyFailedAttempt(
  job: GaneshUploadJob,
  input: { error: unknown; message: string; now?: number; random?: () => number }
): GaneshUploadJob {
  const now = input.now ?? Date.now();
  if (isPermanentUploadFailure(input.error)) {
    return markFailed(job, { message: input.message, reason: "permanent", now });
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    return markFailed(job, { message: input.message, reason: "exhausted", now });
  }
  return {
    ...job,
    state: "RETRYING",
    lastError: input.message,
    failureReason: undefined,
    nextAttemptAt: now + retryDelayMs(job.attempts, input.random),
    updatedAt: now,
  };
}

/** A job the worker may pick up right now. */
export function isDue(job: GaneshUploadJob, now = Date.now()): boolean {
  if (job.state === "PENDING") return true;
  if (job.state === "RETRYING") return (job.nextAttemptAt ?? 0) <= now;
  return false;
}

export function dueUploadJobs(jobs: GaneshUploadJob[], now = Date.now()): GaneshUploadJob[] {
  return jobs.filter((job) => isDue(job, now)).sort((a, b) => a.createdAt - b.createdAt);
}

/** When the worker should next wake, or undefined if nothing is waiting. */
export function nextWakeAt(jobs: GaneshUploadJob[]): number | undefined {
  const waiting = jobs
    .filter((job) => job.state === "RETRYING" && typeof job.nextAttemptAt === "number")
    .map((job) => job.nextAttemptAt as number);
  return waiting.length > 0 ? Math.min(...waiting) : undefined;
}

/**
 * Housekeeping applied every time the queue is read from disk.
 *
 * Three separate jobs, all of which have to happen before anything is run:
 *
 * - An `UPLOADING` job can only have been claimed by a process that no longer
 *   exists (the claim never outlives the runtime that made it), so it goes back
 *   to `PENDING`. Left as-is it would be a photo that never uploads again while
 *   permanently looking like it is about to.
 * - A job older than `MAX_JOB_AGE_MS` is failed rather than retried forever.
 * - Finished jobs are dropped once the UI has had its retention window; a
 *   `CANCELLED` job has nothing to report, so it goes immediately.
 */
export function reconcileLoadedJobs(jobs: GaneshUploadJob[], now = Date.now()): GaneshUploadJob[] {
  const next: GaneshUploadJob[] = [];
  for (const job of jobs) {
    if (job.state === "CANCELLED") continue;
    if (isTerminalUploadState(job.state)) {
      if (now - job.updatedAt < COMPLETED_RETENTION_MS) next.push(job);
      continue;
    }
    let reconciled = job;
    if (job.state === "UPLOADING") {
      reconciled = { ...reconciled, state: "PENDING", updatedAt: now };
    }
    if (now - reconciled.createdAt > MAX_JOB_AGE_MS) {
      reconciled = markFailed(reconciled, {
        message: "This photo waited too long to upload. Add it again from the record.",
        reason: "expired",
        now,
      });
    }
    next.push(reconciled);
  }
  return next;
}
