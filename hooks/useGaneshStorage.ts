import { useCallback } from "react";

import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { reportLateWriteFailure } from "@/lib/firestoreWrite";
import { logWarning } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  deleteFile,
  getSignedUrl,
  uploadFestivalFile,
  uploadPandalAssetFile,
  uploadPandalSponsorFile,
} from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { GaneshFileMeta } from "@/shared/types/ganesh";

export function useGaneshStorage() {
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { role, status, permissions, can } = useGaneshPermissions();
  const { festivals } = useFestivals(pandalId);
  const writes = useGaneshWrites();
  const { isOnline } = useNetwork();
  const festivalBelongsToPandal = Boolean(
    festivalId && festivals.some((festival) => festival.id === festivalId)
  );

  const uploadPrepared = useCallback(
    async (input: {
      category: "expenses" | "contributions";
      recordId: string;
      file: PreparedGaneshImage;
    }): Promise<GaneshFileMeta> => {
      if (!realUser?.uid) throw new Error("You must be signed in.");
      if (!pandalId || !festivalId) throw new Error("Select a Pandal and festival first.");
      return uploadFestivalFile({
        uid: realUser.uid,
        role,
        permissions,
        memberStatus: status,
        sessionPandalId: pandalId,
        sessionFestivalId: festivalId,
        pandalId,
        festivalId,
        recordId: input.recordId,
        category: input.category,
        festivalBelongsToPandal,
        file: input.file,
      });
    },
    [festivalBelongsToPandal, festivalId, pandalId, permissions, realUser?.uid, role, status]
  );

  /**
   * A best-effort delete for a path Storage already has and Firestore no longer
   * needs — either because it was superseded by a newer photo, or because the
   * attach that would have linked it to a record just failed. Deliberately
   * fire-and-forget: nothing the user did wrong, so nothing should surface as an
   * error. Left uncleaned, this is exactly the orphan GS-069 describes; a warning
   * gives it a trail for GS-069's own future cleanup sweep to find. `pandalId`
   * is read fresh via a ref-less closure argument rather than the outer hook's
   * value, because a delete-on-replace can legitimately run after the user has
   * already navigated (e.g. the upload for a slow retry lands after the screen
   * that started it is gone).
   */
  const bestEffortCleanup = useCallback((path: string | undefined, scope: string) => {
    if (!path || !pandalId) return;
    void deleteFile(path, { pandalId, festivalId: festivalId ?? undefined }).catch((error) => {
      logWarning(scope, error);
    });
  }, [pandalId, festivalId]);

  /**
   * Cleanup for a failure that arrives *after* `commitWrite` reported the
   * attach as queued (GS-069).
   *
   * The try/catch below only ever sees a rejection from inside the ~1.5s ack
   * grace window. A failure after that window is delivered through
   * `onLateFailure` instead, so the object we just uploaded was left in Storage
   * with no record ever pointing at it and nothing to notice.
   *
   * Supplying `onLateFailure` *replaces* commitWrite's own reporter, so this
   * calls `reportLateWriteFailure` explicitly — otherwise the user would be
   * left believing the photo attached.
   */
  const lateFailureCleanup = useCallback(
    (path: string, scope: string, label: string) => (error: unknown) => {
      bestEffortCleanup(path, scope);
      reportLateWriteFailure(error, label);
    },
    [bestEffortCleanup]
  );

  const uploadExpenseReceipt = useCallback(
    async (expenseId: string, file: PreparedGaneshImage): Promise<GaneshFileMeta> => {
      const meta = await uploadPrepared({ category: "expenses", recordId: expenseId, file });
      try {
        const previousPath = await writes.attachExpenseReceipt(
          expenseId,
          meta,
          lateFailureCleanup(
            meta.path,
            "ganesh.storage.lateOrphanExpenseReceipt",
            "expense receipt"
          )
        );
        bestEffortCleanup(previousPath, "ganesh.storage.replaceExpenseReceipt");
      } catch (error) {
        bestEffortCleanup(meta.path, "ganesh.storage.orphanExpenseReceipt");
        throw error;
      }
      return meta;
    },
    [bestEffortCleanup, lateFailureCleanup, uploadPrepared, writes]
  );

  const uploadContributionPhoto = useCallback(
    async (contributionId: string, file: PreparedGaneshImage): Promise<GaneshFileMeta> => {
      const meta = await uploadPrepared({
        category: "contributions",
        recordId: contributionId,
        file,
      });
      try {
        const previousPath = await writes.attachContributionPhoto(
          contributionId,
          meta,
          lateFailureCleanup(
            meta.path,
            "ganesh.storage.lateOrphanContributionPhoto",
            "contribution photo"
          )
        );
        bestEffortCleanup(previousPath, "ganesh.storage.replaceContributionPhoto");
      } catch (error) {
        bestEffortCleanup(meta.path, "ganesh.storage.orphanContributionPhoto");
        throw error;
      }
      return meta;
    },
    [bestEffortCleanup, lateFailureCleanup, uploadPrepared, writes]
  );

  const uploadAssetPhoto = useCallback(
    async (assetId: string, file: PreparedGaneshImage) => {
      if (!realUser?.uid) throw new Error("You must be signed in.");
      if (!pandalId) throw new Error("Select a Pandal first.");
      if (!can("assets.create") && !can("assets.update")) {
        throw new Error("You do not have permission to upload this file.");
      }
      const meta = await uploadPandalAssetFile({
        uid: realUser.uid,
        role,
        permissions,
        memberStatus: status,
        sessionPandalId: pandalId,
        pandalId,
        assetId,
        file,
      });
      try {
        const previousPath = await writes.attachAssetPhoto(
          assetId,
          meta,
          lateFailureCleanup(meta.path, "ganesh.storage.lateOrphanAssetPhoto", "asset photo")
        );
        bestEffortCleanup(previousPath, "ganesh.storage.replaceAssetPhoto");
      } catch (error) {
        bestEffortCleanup(meta.path, "ganesh.storage.orphanAssetPhoto");
        throw error;
      }
      return meta;
    },
    [
      bestEffortCleanup,
      lateFailureCleanup,
      can,
      pandalId,
      permissions,
      realUser?.uid,
      role,
      status,
      writes,
    ]
  );

  const uploadSponsorPhoto = useCallback(
    async (sponsorId: string, file: PreparedGaneshImage) => {
      if (!realUser?.uid) throw new Error("You must be signed in.");
      if (!pandalId) throw new Error("Select a Pandal first.");
      if (!can("sponsors.create") && !can("sponsors.update")) {
        throw new Error("You do not have permission to upload this file.");
      }
      const meta = await uploadPandalSponsorFile({
        uid: realUser.uid,
        role,
        permissions,
        memberStatus: status,
        sessionPandalId: pandalId,
        pandalId,
        sponsorId,
        file,
      });
      try {
        const previousPath = await writes.attachSponsorPhoto(
          sponsorId,
          meta,
          lateFailureCleanup(meta.path, "ganesh.storage.lateOrphanSponsorPhoto", "sponsor photo")
        );
        bestEffortCleanup(previousPath, "ganesh.storage.replaceSponsorPhoto");
      } catch (error) {
        bestEffortCleanup(meta.path, "ganesh.storage.orphanSponsorPhoto");
        throw error;
      }
      return meta;
    },
    [
      bestEffortCleanup,
      lateFailureCleanup,
      can,
      pandalId,
      permissions,
      realUser?.uid,
      role,
      status,
      writes,
    ]
  );

  const signedUrl = useCallback(
    async (path: string): Promise<string> => {
      if (!pandalId) throw new Error("Select a Pandal first.");
      return getSignedUrl(path, { pandalId, festivalId: festivalId ?? undefined });
    },
    [festivalId, pandalId]
  );

  const removeStoredFile = useCallback(
    async (path: string): Promise<void> => {
      if (!pandalId) throw new Error("Select a Pandal first.");
      await deleteFile(path, { pandalId, festivalId: festivalId ?? undefined });
    },
    [festivalId, pandalId]
  );

  return {
    isOnline,
    pandalId,
    festivalId,
    uploadExpenseReceipt,
    uploadContributionPhoto,
    uploadAssetPhoto,
    uploadSponsorPhoto,
    signedUrl,
    removeStoredFile,
  };
}
