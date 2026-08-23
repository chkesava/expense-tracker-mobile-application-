import { assertCanUpload, assertCanUploadPandalAsset } from "@/services/ganesh/storage/storageAuth";
import {
  assertOwnedFestivalPath,
  assertOwnedPandalAssetPath,
  buildFestivalFilePath,
  buildPandalAssetPath,
  isPandalAssetPath,
} from "@/services/ganesh/storage/storagePaths";
import {
  createObjectSignedUrl,
  removeObject,
  uploadObject,
} from "@/services/ganesh/storage/supabaseStorage";
import type {
  GaneshFileMeta,
  UploadFestivalFileInput,
  UploadPandalAssetFileInput,
} from "@/services/ganesh/storage/storageTypes";

export { assertCanUpload, assertCanUploadPandalAsset } from "@/services/ganesh/storage/storageAuth";
export { ganeshStoredPath } from "@/services/ganesh/storage/storagePaths";
export { prepareGaneshImage } from "@/services/ganesh/storage/imagePrepare";

export async function uploadPandalAssetFile(
  input: UploadPandalAssetFileInput
): Promise<GaneshFileMeta> {
  assertCanUploadPandalAsset({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    pandalId: input.pandalId,
  });
  const path = buildPandalAssetPath({
    pandalId: input.pandalId,
    assetId: input.assetId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

export async function uploadFestivalFile(input: UploadFestivalFileInput): Promise<GaneshFileMeta> {
  assertCanUpload({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    sessionFestivalId: input.sessionFestivalId,
    pandalId: input.pandalId,
    festivalId: input.festivalId,
    category: input.category,
    festivalBelongsToPandal: input.festivalBelongsToPandal,
  });

  const path = buildFestivalFilePath({
    pandalId: input.pandalId,
    festivalId: input.festivalId,
    category: input.category,
    recordId: input.recordId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedUrl(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<string> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 5_000) return cached.url;
  const url = await createObjectSignedUrl(path);
  signedUrlCache.set(path, { url, expiresAt: Date.now() + 25 * 60 * 1000 });
  return url;
}

export async function deleteFile(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<void> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  await removeObject(path);
}
