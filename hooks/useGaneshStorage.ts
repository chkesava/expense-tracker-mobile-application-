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
} from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { GaneshFileMeta } from "@/shared/types/ganesh";

export function useGaneshStorage() {
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { role, status } = useGaneshPermissions();
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
    [festivalBelongsToPandal, festivalId, pandalId, realUser?.uid, role, status]
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

  const signedUrl = useCallback(
    async (path: string): Promise<string> => {
      if (!pandalId || !festivalId) throw new Error("Select a Pandal and festival first.");
      return getSignedUrl(path, { pandalId, festivalId });
    },
    [festivalId, pandalId]
  );

  const removeStoredFile = useCallback(
    async (path: string): Promise<void> => {
      if (!pandalId || !festivalId) throw new Error("Select a Pandal and festival first.");
      await deleteFile(path, { pandalId, festivalId });
    },
    [festivalId, pandalId]
  );

  return {
    isOnline,
    pandalId,
    festivalId,
    uploadExpenseReceipt,
    uploadContributionPhoto,
    signedUrl,
    removeStoredFile,
  };
}
