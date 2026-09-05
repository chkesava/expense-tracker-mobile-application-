/**
 * Staging — the half of durability that a JSON record cannot provide (GS-040).
 *
 * `expo-image-picker` and `expo-image-manipulator` both hand back a URI in the
 * **cache** directory. The OS is free to reclaim that the moment storage gets
 * tight, and on Android it routinely does between the app being backgrounded
 * and the user opening it again. A queue that persisted only the URI would
 * survive a restart and then find nothing to upload — a job that is durable
 * about the wrong thing.
 *
 * So enqueueing copies the bytes into `Paths.document/ganesh-upload-queue`,
 * which the system does not reclaim, and the job points at that copy. This is
 * also why `enqueueGaneshUpload` is async and can fail: the promise resolves
 * only once the image is genuinely somewhere it will still be tomorrow.
 *
 * Kept in its own module because it is the only part of the queue that touches
 * a native module, so every other part stays testable in plain Node.
 */

import { Directory, File, Paths } from "expo-file-system";

import { logWarning } from "@/lib/errors";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { GaneshUploadJobFile } from "@/services/ganesh/storage/uploadQueue/uploadJob";

const QUEUE_DIRECTORY = "ganesh-upload-queue";

function queueDirectory(): Directory {
  const dir = new Directory(Paths.document, QUEUE_DIRECTORY);
  dir.create({ idempotent: true });
  return dir;
}

/** Job ids carry `:` separators, which are not portable in a filename. */
function stagedFileName(jobId: string, fileName: string): string {
  const safeId = jobId.replace(/[^A-Za-z0-9._-]/g, "_");
  const extension = fileName.split(".").pop() ?? "jpg";
  return `${safeId}.${extension}`;
}

/**
 * Copy a prepared image into durable storage and describe the copy.
 *
 * Throws rather than degrading: the caller's whole contract is that a resolved
 * enqueue means the photo is safe, so a staging failure has to reach the user.
 */
export async function stageUploadFile(
  jobId: string,
  prepared: PreparedGaneshImage
): Promise<GaneshUploadJobFile> {
  const target = new File(queueDirectory(), stagedFileName(jobId, prepared.fileName));
  // A re-enqueue for the same slot overwrites the previous staged image; the
  // job record it belonged to is being replaced in the same breath.
  if (target.exists) target.delete();

  if (prepared.bytes) {
    // `prepareGaneshImage` already read the file for the upload payload
    // (GS-097), so writing those bytes avoids a second full read.
    target.create();
    target.write(new Uint8Array(prepared.bytes));
  } else {
    await new File(prepared.uri).copy(target, { overwrite: true });
  }

  if (!target.exists || target.size <= 0) {
    throw new Error("Could not save the photo on this device. Please try again.");
  }
  return {
    uri: target.uri,
    fileName: prepared.fileName,
    mimeType: prepared.mimeType,
    // The staged file is the thing that will be uploaded, so its size is the
    // one to declare — not the size the picker reported for the original.
    size: target.size,
  };
}

/** Reads a staged image back for upload. Throws if it is no longer there. */
export async function readStagedBytes(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  if (!file.exists) throw new Error("The saved photo is no longer on this device.");
  const bytes = await file.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function stagedFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/**
 * Delete a staged copy. Best effort by design — it runs when a job reaches a
 * terminal state, and a leftover file is a wasted megabyte, not a lost photo.
 */
export function discardStagedFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    logWarning("ganesh.uploadQueue.discardStaged", error);
  }
}

/**
 * Delete staged files no live job points at.
 *
 * The queue is the source of truth, so anything in the directory without a job
 * is an orphan from a crash between staging and persisting the record — the one
 * window where the two can disagree.
 */
export function pruneStagedFiles(activeUris: Set<string>): void {
  try {
    for (const entry of queueDirectory().list()) {
      if (!(entry instanceof File)) continue;
      if (activeUris.has(entry.uri)) continue;
      entry.delete();
    }
  } catch (error) {
    logWarning("ganesh.uploadQueue.pruneStaged", error);
  }
}
