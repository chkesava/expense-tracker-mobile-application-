/**
 * The bridge from a persisted job back to the existing storage stack (GS-040).
 *
 * Nothing here re-implements uploading. Each target maps onto the same
 * `storageService` entry point the screens used to call directly, so a queued
 * upload goes through the identical permission assertion, the identical path
 * builder and the identical `ganesh-files` Edge Function grant. The queue adds
 * durability and retry around that stack; it is not a second one.
 *
 * The same is true of the attach step: it calls the very `attach*` writers the
 * screens called, including their `onLateFailure` hook, so audit entries and
 * replaced-photo cleanup behave exactly as before.
 */

import { getFirestoreDb } from "@/lib/firebase";
import { attachAssetPhoto } from "@/services/ganesh/ganeshAssets";
import { attachSponsorPhoto } from "@/services/ganesh/ganeshSponsors";
import { attachContributionPhoto, attachExpenseReceipt } from "@/services/ganesh/ganeshWrites";
import {
  deleteFile,
  uploadFestivalFile,
  uploadPandalAssetFile,
  uploadPandalSponsorFile,
} from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type {
  GaneshUploadJob,
  GaneshUploadTarget,
  GaneshUploadTargetKind,
} from "@/services/ganesh/storage/uploadQueue/uploadJob";
import { readStagedBytes } from "@/services/ganesh/storage/uploadQueue/uploadStaging";
import type { GaneshFileMeta } from "@/shared/types/ganesh";

/** What the user calls this photo, for copy and logs. */
export const UPLOAD_TARGET_LABEL: Record<GaneshUploadTargetKind, string> = {
  expenseReceipt: "receipt",
  contributionPhoto: "contribution photo",
  assetPhoto: "asset photo",
  sponsorPhoto: "sponsor photo",
};

function requireDb() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

async function preparedFromJob(job: GaneshUploadJob): Promise<PreparedGaneshImage> {
  return {
    uri: job.file.uri,
    mimeType: job.file.mimeType,
    fileName: job.file.fileName,
    size: job.file.size,
    bytes: await readStagedBytes(job.file.uri),
  };
}

/**
 * Push the bytes.
 *
 * The storage path is rebuilt here rather than persisted, and rebuilds
 * identically every time: it is a pure function of the pandal, festival, record
 * and the deterministic file name `prepareGaneshImage` produces. That is what
 * makes a retry overwrite the same object instead of littering the bucket with
 * near-duplicates of the same receipt.
 */
export async function uploadJobObject(job: GaneshUploadJob): Promise<GaneshFileMeta> {
  const file = await preparedFromJob(job);
  const target = job.target;
  const shared = {
    uid: job.actor.uid,
    role: job.auth.role,
    permissions: job.auth.permissions,
    memberStatus: job.auth.memberStatus,
    sessionPandalId: target.pandalId,
    pandalId: target.pandalId,
    file,
  };
  switch (target.kind) {
    case "expenseReceipt":
    case "contributionPhoto":
      return uploadFestivalFile({
        ...shared,
        sessionFestivalId: target.festivalId,
        festivalId: target.festivalId,
        recordId: target.recordId,
        category: target.kind === "expenseReceipt" ? "expenses" : "contributions",
        festivalBelongsToPandal: job.auth.festivalBelongsToPandal,
      });
    case "assetPhoto":
      return uploadPandalAssetFile({ ...shared, assetId: target.recordId });
    case "sponsorPhoto":
      return uploadPandalSponsorFile({ ...shared, sponsorId: target.recordId });
  }
}

/**
 * Point the record at the uploaded object.
 *
 * Returns the path of the photo this one replaced, when there was one and the
 * write was server-acknowledged, so the caller can reclaim the old object.
 */
export async function attachJobObject(
  job: GaneshUploadJob,
  meta: GaneshFileMeta,
  onLateFailure: (error: unknown) => void
): Promise<string | undefined> {
  const db = requireDb();
  const actor = job.actor;
  const target = job.target;
  switch (target.kind) {
    case "expenseReceipt":
      return attachExpenseReceipt(
        db,
        actor,
        target.pandalId,
        target.festivalId,
        target.recordId,
        meta,
        onLateFailure
      );
    case "contributionPhoto":
      return attachContributionPhoto(
        db,
        actor,
        target.pandalId,
        target.festivalId,
        target.recordId,
        meta,
        onLateFailure
      );
    case "assetPhoto":
      return attachAssetPhoto(db, actor, target.pandalId, target.recordId, meta, onLateFailure);
    case "sponsorPhoto":
      return attachSponsorPhoto(db, actor, target.pandalId, target.recordId, meta, onLateFailure);
  }
}

/** Reclaims an object no record will ever point at. */
export async function removeJobObject(
  target: GaneshUploadTarget,
  path: string
): Promise<void> {
  await deleteFile(path, {
    pandalId: target.pandalId,
    festivalId: "festivalId" in target ? target.festivalId : undefined,
  });
}
