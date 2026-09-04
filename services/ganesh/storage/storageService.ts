import {
  assertCanUpload,
  assertCanUploadPandalAsset,
  assertCanUploadPandalSponsor,
} from "@/services/ganesh/storage/storageAuth";
import {
  assertOwnedFestivalPath,
  assertOwnedPandalAssetPath,
  assertOwnedPandalSponsorPath,
  buildFestivalFilePath,
  buildPandalAssetPath,
  buildPandalSponsorPath,
  isPandalAssetPath,
  isPandalSponsorPath,
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
  UploadPandalSponsorFileInput,
} from "@/services/ganesh/storage/storageTypes";

export { assertCanUpload, assertCanUploadPandalAsset, assertCanUploadPandalSponsor } from "@/services/ganesh/storage/storageAuth";
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
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

export async function uploadPandalSponsorFile(
  input: UploadPandalSponsorFileInput
): Promise<GaneshFileMeta> {
  assertCanUploadPandalSponsor({
    uid: input.uid,
    role: input.role,
    permissions: input.permissions,
    memberStatus: input.memberStatus,
    sessionPandalId: input.sessionPandalId,
    pandalId: input.pandalId,
  });
  const path = buildPandalSponsorPath({
    pandalId: input.pandalId,
    sponsorId: input.sponsorId,
    fileName: input.file.fileName,
  });
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
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
  await uploadObject(path, input.file.uri, input.file.mimeType, input.file.bytes);
  return {
    path,
    fileName: path.split("/").pop() ?? input.file.fileName,
    mimeType: input.file.mimeType,
    size: input.file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.uid,
  };
}

// Must stay at or below the Edge Function's DOWNLOAD_URL_TTL_SECONDS
// (supabase/functions/ganesh-files/index.ts) — a cache TTL longer than the URL's
// real lifetime hands out a link that looks valid but has already expired
// server-side. Kept a minute short of the 5-minute grant as a safety margin.
const SIGNED_URL_CACHE_MS = 4 * 60 * 1000;

/**
 * Hard cap on the signed-URL cache (GS-096).
 *
 * The map had no eviction and no size bound, so in a long-lived session it grew
 * once per distinct file ever previewed and never shrank — a slow leak that
 * only ended when the process did.
 *
 * Entries are short-lived (4 minutes), so almost everything in here is stale
 * almost all of the time; a sweep on write reclaims it without needing a timer.
 * The cap is the backstop for the one case a sweep cannot help: more than 300
 * distinct files previewed inside a single 4-minute window, where every entry
 * is still live. Evicting the soonest-to-expire costs at most one re-mint.
 */
const SIGNED_URL_CACHE_MAX = 300;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function pruneSignedUrlCache(now: number): void {
  for (const [key, entry] of signedUrlCache) {
    if (entry.expiresAt <= now) signedUrlCache.delete(key);
  }
  if (signedUrlCache.size < SIGNED_URL_CACHE_MAX) return;
  // Everything left is still live, so drop whichever expires first.
  let oldestKey: string | undefined;
  let oldestExpiry = Infinity;
  for (const [key, entry] of signedUrlCache) {
    if (entry.expiresAt < oldestExpiry) {
      oldestExpiry = entry.expiresAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) signedUrlCache.delete(oldestKey);
}

/** Exported for tests only. */
export function __signedUrlCacheSize(): number {
  return signedUrlCache.size;
}

export async function getSignedUrl(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<string> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else if (isPandalSponsorPath(path)) {
    assertOwnedPandalSponsorPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now + 5_000) return cached.url;
  const url = await createObjectSignedUrl(path);
  pruneSignedUrlCache(now);
  signedUrlCache.set(path, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
  return url;
}

export async function deleteFile(
  path: string,
  expected: { pandalId: string; festivalId?: string }
): Promise<void> {
  if (isPandalAssetPath(path)) {
    assertOwnedPandalAssetPath(path, { pandalId: expected.pandalId });
  } else if (isPandalSponsorPath(path)) {
    assertOwnedPandalSponsorPath(path, { pandalId: expected.pandalId });
  } else {
    if (!expected.festivalId) throw new Error("Select a Pandal and festival first.");
    assertOwnedFestivalPath(path, { pandalId: expected.pandalId, festivalId: expected.festivalId });
  }
  await removeObject(path);
}
