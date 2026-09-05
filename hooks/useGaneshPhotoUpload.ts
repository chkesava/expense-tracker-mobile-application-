/**
 * A screen's view of one slot in the upload queue (GS-040).
 *
 * Screens used to own the upload: hold the prepared image in state, await it,
 * and re-try it from an effect while they happened to still be mounted. This
 * hook replaces all of that with a single `queue` call and a status read back
 * out of the persisted queue, so what the screen shows is what is actually on
 * disk — including when the screen has been re-opened long after the upload was
 * started, or after the app was killed and relaunched.
 *
 * The authorization context is captured here, from live session state, and
 * travels with the job. See `GaneshUploadAuthContext` for why that is safe.
 */

import { useCallback } from "react";

import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useGaneshUploadQueue } from "@/providers/GaneshUploadQueueProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import {
  cancelGaneshUploadJob,
  enqueueGaneshUpload,
  retryGaneshUploadJob,
  uploadJobId,
  type GaneshUploadJob,
  type GaneshUploadTarget,
  type GaneshUploadTargetKind,
} from "@/services/ganesh/storage/uploadQueue";

/** What the uploader control should render. */
export type GaneshUploadStatus =
  | "idle"
  | "selected"
  | "queued"
  | "uploading"
  | "uploaded"
  | "failed";

export function uploadStatusOf(
  job: GaneshUploadJob | undefined,
  hasSelection: boolean
): GaneshUploadStatus {
  if (!job) return hasSelection ? "selected" : "idle";
  switch (job.state) {
    case "UPLOADING":
      return "uploading";
    case "UPLOADED":
      return "uploaded";
    case "FAILED":
      return "failed";
    default:
      // PENDING and RETRYING are the same promise to the user: it is saved on
      // this device and the app will keep trying.
      return "queued";
  }
}

export function useGaneshPhotoUpload(kind: GaneshUploadTargetKind) {
  const { realUser } = useAuth();
  const { pandalId, festivalId, actor } = useGaneshSession();
  const { role, status, permissions } = useGaneshPermissions();
  const { festivals } = useFestivals(pandalId);
  const { jobs, runNow } = useGaneshUploadQueue();
  const { isOnline } = useNetwork();

  const festivalBelongsToPandal = Boolean(
    festivalId && festivals.some((festival) => festival.id === festivalId)
  );
  const needsFestival = kind === "expenseReceipt" || kind === "contributionPhoto";

  const targetFor = useCallback(
    (recordId: string): GaneshUploadTarget => {
      if (!pandalId) throw new Error("Select a Pandal first.");
      if (needsFestival) {
        if (!festivalId) throw new Error("Select a Pandal and festival first.");
        return { kind, pandalId, festivalId, recordId } as GaneshUploadTarget;
      }
      return { kind, pandalId, recordId } as GaneshUploadTarget;
    },
    [festivalId, kind, needsFestival, pandalId]
  );

  /**
   * Hand the photo to the queue.
   *
   * Resolves only once the image is staged in app storage and the job is on
   * disk, so a caller may tell the user it is queued the moment this returns —
   * and must not before.
   */
  const queue = useCallback(
    async (recordId: string, file: PreparedGaneshImage): Promise<GaneshUploadJob> => {
      if (!realUser?.uid) throw new Error("You must be signed in.");
      const job = await enqueueGaneshUpload({
        target: targetFor(recordId),
        file,
        actor: actor ?? {
          uid: realUser.uid,
          displayName: realUser.displayName ?? "Member",
        },
        auth: {
          role,
          permissions,
          memberStatus: status,
          festivalBelongsToPandal,
        },
      });
      runNow();
      return job;
    },
    [
      actor,
      festivalBelongsToPandal,
      permissions,
      realUser?.displayName,
      realUser?.uid,
      role,
      runNow,
      status,
      targetFor,
    ]
  );

  const jobFor = useCallback(
    (recordId: string | null | undefined): GaneshUploadJob | undefined => {
      if (!recordId || !pandalId) return undefined;
      if (needsFestival && !festivalId) return undefined;
      const id = uploadJobId(targetFor(recordId));
      return jobs.find((job) => job.id === id);
    },
    [festivalId, jobs, needsFestival, pandalId, targetFor]
  );

  return {
    isOnline,
    queue,
    jobFor,
    statusFor: (recordId: string | null | undefined, hasSelection: boolean) =>
      uploadStatusOf(jobFor(recordId), hasSelection),
    retry: useCallback(
      async (recordId: string) => {
        await retryGaneshUploadJob(uploadJobId(targetFor(recordId)));
        runNow();
      },
      [runNow, targetFor]
    ),
    cancel: useCallback(
      async (recordId: string) => cancelGaneshUploadJob(uploadJobId(targetFor(recordId))),
      [targetFor]
    ),
  };
}

/**
 * What the picker control should show for a record's photo.
 *
 * The awkward case is the one worth naming: the ledger row saved but no job
 * exists. That can only mean the enqueue itself failed — the photo was never
 * staged — so it is a real failure the user has to retry, not an idle picker.
 * `busy` covers the moment in between, while the enqueue is still running.
 */
export function pickerStatus(input: {
  job: GaneshUploadJob | undefined;
  hasSelection: boolean;
  recordSaved: boolean;
  busy: boolean;
}): GaneshUploadStatus {
  if (input.job) return uploadStatusOf(input.job, input.hasSelection);
  if (!input.hasSelection) return "idle";
  if (input.busy) return "uploading";
  return input.recordSaved ? "failed" : "selected";
}
