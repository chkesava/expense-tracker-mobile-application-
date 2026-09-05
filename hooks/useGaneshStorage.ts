import { useCallback } from "react";

import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { deleteFile, getSignedUrl } from "@/services/ganesh/storage/storageService";

/**
 * Reading and deleting Ganesh files.
 *
 * Uploading used to live here too — pick, upload, attach, clean up the orphan
 * if the attach failed, all inside a hook whose lifetime was the screen's. That
 * whole path is now the durable queue (GS-040): see `useGaneshPhotoUpload` for
 * enqueueing and `services/ganesh/storage/uploadQueue` for what happens after.
 * The orphan handling moved with it — the worker reclaims a replaced object when
 * the attach is acknowledged, and re-opens a job whose attach failed late.
 */
export function useGaneshStorage() {
  const { pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();

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
    signedUrl,
    removeStoredFile,
  };
}
