import { useCallback } from "react";

import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
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

  const uploadExpenseReceipt = useCallback(
    async (expenseId: string, file: PreparedGaneshImage): Promise<GaneshFileMeta> => {
      const meta = await uploadPrepared({ category: "expenses", recordId: expenseId, file });
      await writes.attachExpenseReceipt(expenseId, meta);
      return meta;
    },
    [uploadPrepared, writes]
  );

  const uploadContributionPhoto = useCallback(
    async (contributionId: string, file: PreparedGaneshImage): Promise<GaneshFileMeta> => {
      const meta = await uploadPrepared({
        category: "contributions",
        recordId: contributionId,
        file,
      });
      await writes.attachContributionPhoto(contributionId, meta);
      return meta;
    },
    [uploadPrepared, writes]
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
      await writes.attachAssetPhoto(assetId, meta);
      return meta;
    },
    [can, pandalId, permissions, realUser?.uid, role, status, writes]
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
      await writes.attachSponsorPhoto(sponsorId, meta);
      return meta;
    },
    [can, pandalId, permissions, realUser?.uid, role, status, writes]
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
